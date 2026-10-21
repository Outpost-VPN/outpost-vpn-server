package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func journalFixture(t *testing.T, text string) map[string]any {
	t.Helper()
	directory := t.TempDir()
	path := filepath.Join(directory, "entries.jsonl")
	if err := os.WriteFile(path, []byte(text), 0600); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\ncase \" $* \" in *' --reverse '*) ;; *) exit 9 ;; esac\nexec cat \"$OUTPOST_TEST_JOURNAL\"\n"
	if err := os.WriteFile(filepath.Join(directory, "journalctl"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OUTPOST_TEST_JOURNAL", path)
	t.Setenv("PATH", directory+string(os.PathListSeparator)+os.Getenv("PATH"))
	return map[string]any{"engine": "hysteria", "connectionId": "44e566b6-4c98-41cf-bb7b-03dc56ab17fc", "since": float64(time.Now().Add(-time.Hour).UnixMilli()), "limit": float64(25)}
}

func journalEntry(id, timestamp, padding string) string {
	message := `INFO client connected {"id":"` + id + `","addr":"private-address","padding":"` + padding + `"}`
	value, _ := json.Marshal(map[string]string{"MESSAGE": message, "__REALTIME_TIMESTAMP": timestamp})
	return string(value) + "\n"
}

func TestLargeJournalReturnsLatestNormalizedEvents(t *testing.T) {
	id := "44e566b6-4c98-41cf-bb7b-03dc56ab17fc"
	newest := journalEntry(id, "1700000002000000", "")
	text := newest + strings.Repeat(journalEntry("another-connection", "1700000001000000", strings.Repeat("private-content", 150)), 600)
	text += journalEntry(id, "1700000000000000", "")
	output, err := readConnectionEvents(context.Background(), journalFixture(t, text))
	if err != nil {
		t.Fatalf("large journal became unavailable: %v", err)
	}
	var result struct {
		Events    []connectionEvent `json:"events"`
		Truncated bool              `json:"truncated"`
	}
	if err := json.Unmarshal([]byte(output), &result); err != nil {
		t.Fatal(err)
	}
	if !result.Truncated || len(result.Events) != 1 || result.Events[0].SampledAt != 1700000002000 {
		t.Fatalf("missing latest event or truncation: %s", output)
	}
	if strings.Contains(output, "private-") || strings.Contains(output, "padding") {
		t.Fatal("raw journal fields escaped the agent")
	}
}

func TestConnectionEventsExposeOnlyNormalizedReasons(t *testing.T) {
	id := "44e566b6-4c98-41cf-bb7b-03dc56ab17fc"
	cases := []struct {
		message, event, reason string
		matched                bool
	}{
		{`INFO client connected {"id":"` + id + `","addr":"secret-address"}`, "connected", "connected", true},
		{`INFO client disconnected {"id":"` + id + `","error":"timeout: no recent network activity","reqAddr":"private-destination"}`, "disconnected", "idle_timeout", true},
		{`WARN TCP error {"user":"` + id + `.2@outpost.local","error":"connection reset by peer"}`, "error", "connection_reset", true},
		{`INFO client connected {"id":"other-client","addr":"` + id + `"}`, "", "", false},
		{`INFO client connected {"id":"other-client","reqAddr":"` + id + `"}`, "", "", false},
	}
	for _, row := range cases {
		event, reason, matched := normalizeConnectionEvent(row.message, id)
		if event != row.event || reason != row.reason || matched != row.matched {
			t.Fatalf("unexpected normalized event: %q %q %v", event, reason, matched)
		}
	}
}

func TestJournalKeepsLatestEventsInChronologicalOrder(t *testing.T) {
	id := "44e566b6-4c98-41cf-bb7b-03dc56ab17fc"
	input := journalEntry(id, "1700000003000000", "") + journalEntry(id, "1700000002000000", "") + journalEntry(id, "1700000001000000", "")
	result, err := scanConnectionEvents(strings.NewReader(input), "hysteria", id, 2)
	if err != nil || !result.Truncated || len(result.Events) != 2 || result.Events[0].SampledAt != 1700000002000 || result.Events[1].SampledAt != 1700000003000 {
		t.Fatalf("latest event window incorrect: %+v, %v", result, err)
	}
	result, err = scanConnectionEvents(strings.NewReader(input), "hysteria", id, 3)
	if err != nil || result.Truncated || len(result.Events) != 3 {
		t.Fatalf("complete window marked truncated: %+v, %v", result, err)
	}
}

type failedJournalReader struct{}

func (failedJournalReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }

func TestJournalBoundsOversizedLinesAndReportsActualErrors(t *testing.T) {
	id := "44e566b6-4c98-41cf-bb7b-03dc56ab17fc"
	for _, input := range []string{strings.Repeat("x", maxJournalBytes*2), strings.Repeat("{}\n", maxJournalLines+1)} {
		result, err := scanConnectionEvents(strings.NewReader(input), "hysteria", id, 25)
		if err != nil || !result.Truncated || len(result.Events) != 0 {
			t.Fatalf("journal budget became unavailable: %+v, %v", result, err)
		}
	}
	if _, err := scanConnectionEvents(failedJournalReader{}, "hysteria", id, 25); !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("actual read failure was hidden: %v", err)
	}
	result, err := scanConnectionEvents(strings.NewReader("invalid JSON\n"+journalEntry(id, "invalid timestamp", "")), "hysteria", id, 25)
	if err != nil || result.Truncated || len(result.Events) != 0 {
		t.Fatalf("invalid rows should be discarded: %+v, %v", result, err)
	}
}

func TestJournalPropagatesCommandFailureAndCancellation(t *testing.T) {
	payload := journalFixture(t, "")
	script := filepath.Join(strings.Split(os.Getenv("PATH"), string(os.PathListSeparator))[0], "journalctl")
	if err := os.WriteFile(script, []byte("#!/bin/sh\nexit 1\n"), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := readConnectionEvents(context.Background(), payload); err == nil {
		t.Fatal("journal failure was hidden")
	}
	if err := os.WriteFile(script, []byte("#!/bin/sh\nexec sleep 30\n"), 0700); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := readConnectionEvents(ctx, payload); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("cancellation was hidden: %v", err)
	}
}

func TestDiagnosticDisconnectCancelsAgentChild(t *testing.T) {
	payload := journalFixture(t, "")
	directory := strings.Split(os.Getenv("PATH"), string(os.PathListSeparator))[0]
	started := filepath.Join(directory, "started")
	t.Setenv("OUTPOST_TEST_STARTED", started)
	if err := os.WriteFile(filepath.Join(directory, "journalctl"), []byte("#!/bin/sh\n: >\"$OUTPOST_TEST_STARTED\"\nexec sleep 30\n"), 0700); err != nil {
		t.Fatal(err)
	}
	client, server := net.Pipe()
	defer client.Close()
	done := make(chan struct{})
	go func() { handle(server); close(done) }()
	request, _ := json.Marshal(map[string]any{"action": "logs.read", "payload": payload})
	if _, err := client.Write(append(request, '\n')); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for {
		if _, err := os.Stat(started); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("journal child did not start")
		}
		time.Sleep(5 * time.Millisecond)
	}
	client.Close()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("disconnected diagnostic kept its child running")
	}
}
