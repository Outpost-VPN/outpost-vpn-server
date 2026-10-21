package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
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
	return journalMessageEntry(message, timestamp)
}

func journalMessageEntry(message any, timestamp string) string {
	value, _ := json.Marshal(map[string]any{"MESSAGE": message, "__REALTIME_TIMESTAMP": timestamp})
	return string(value) + "\n"
}

func journalBytes(message string) []int {
	// []byte marshals as base64 in Go; journalctl emits numeric byte arrays.
	value := make([]int, len(message))
	for i := range value {
		value[i] = int(message[i])
	}
	return value
}

func TestJournalDecodesANSIStringAndByteMessages(t *testing.T) {
	id := "44e566b6-4c98-41cf-bb7b-03dc56ab17fc"
	connected := "\x1b[36mINFO\x1b[0m\tclient connected " + `{"id":"` + id + `","addr":"private-address","password":"private-credential","detail":"тест"}`
	disconnected := "\x1b[34mINFO\x1b[0m\tclient disconnected " + `{"id":"` + id + `","error":"timeout: no recent network activity","reqAddr":"private-destination"}`
	unrelated := "\x1b[36mINFO\x1b[0m\tclient connected " + `{"id":"other-client","addr":"` + id + `"}`
	for _, bytes := range []bool{false, true} {
		name := "string"
		encode := func(message string) any { return message }
		if bytes {
			name = "byte array"
			encode = func(message string) any { return journalBytes(message) }
		}
		t.Run(name, func(t *testing.T) {
			input := journalMessageEntry(encode(disconnected), "1700000002000000") + journalMessageEntry(encode(unrelated), "1700000001500000") + journalMessageEntry(encode(connected), "1700000001000000")
			output, err := readConnectionEvents(context.Background(), journalFixture(t, input))
			if err != nil {
				t.Fatal(err)
			}
			want, _ := json.Marshal(connectionEvents{Events: []connectionEvent{
				{SampledAt: 1700000001000, Engine: "hysteria", Type: "connected", Reason: "connected", Level: "info", Count: 1},
				{SampledAt: 1700000002000, Engine: "hysteria", Type: "disconnected", Reason: "idle_timeout", Level: "info", Count: 1},
			}})
			if output != string(want) {
				t.Fatalf("missing normalized events or leaked raw fields: %s", output)
			}
		})
	}
}

func TestJournalSkipsInvalidMessagesWithoutDroppingFollowingEvents(t *testing.T) {
	id := "44e566b6-4c98-41cf-bb7b-03dc56ab17fc"
	invalidUTF8 := journalBytes("\xffINFO client connected " + `{"id":"` + id + `"}`)
	for _, message := range []any{nil, true, 42, map[string]string{"id": id}, []int{-1}, []int{256}, []float64{1.5}, []string{"not a byte"}, invalidUTF8} {
		input := journalMessageEntry(message, "1700000002000000") + journalEntry(id, "1700000001000000", "")
		result, err := scanConnectionEvents(strings.NewReader(input), "hysteria", id, 25)
		if err != nil || result.Truncated || len(result.Events) != 1 || result.Events[0].SampledAt != 1700000001000 {
			t.Fatalf("invalid MESSAGE affected following events: %+v, %v", result, err)
		}
	}
}

func TestLargeJournalReturnsLatestNormalizedEvents(t *testing.T) {
	id := "44e566b6-4c98-41cf-bb7b-03dc56ab17fc"
	newest := journalMessageEntry(journalBytes("\x1b[36mINFO\x1b[0m\tclient connected "+`{"id":"`+id+`","addr":"private-address"}`), "1700000002000000")
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
		message, event, reason, level string
		matched                       bool
	}{
		{`INFO client connected {"id":"` + id + `","addr":"secret-address"}`, "connected", "connected", "info", true},
		{`INFO client disconnected {"id":"` + id + `","error":"timeout: no recent network activity","reqAddr":"private-destination"}`, "disconnected", "idle_timeout", "info", true},
		{`WARN TCP error {"user":"` + id + `.2@outpost.local","error":"connection reset by peer"}`, "error", "connection_reset", "warn", true},
		{`INFO client connected {"id":"other-client","addr":"` + id + `"}`, "", "", "", false},
		{`INFO client connected {"id":"other-client","reqAddr":"` + id + `"}`, "", "", "", false},
	}
	for _, row := range cases {
		result, matched := normalizeConnectionEvent(row.message, id)
		if result.event.Type != row.event || result.event.Reason != row.reason || result.event.Level != row.level || matched != row.matched {
			t.Fatalf("unexpected normalized event: %+v %v", result.event, matched)
		}
	}
}

func TestJournalDistinguishesStreamCancellationAndUpstreamConnectTimeout(t *testing.T) {
	id := "44e566b6-4c98-41cf-bb7b-03dc56ab17fc"
	for _, row := range []struct{ heading, error, reason, level string }{
		{"2026-10-21T21:14:39Z \x1b[33mWARN\x1b[0m TCP error", "stream 144 canceled by remote with error code 0", "client_cancelled_stream", "warn"},
		{"ERROR TCP error", "stream 4 canceled by remote with error code 42", "client_cancelled_stream", "error"},
		{"WARN TCP error", "dial tcp 203.0.113.1:443: i/o timeout", "upstream_connect_timeout", "warn"},
		{"WARN TCP error", "dial tcp6 [2001:db8::1]:443: i/o timeout", "upstream_connect_timeout", "warn"},
		{"WARN TCP error", "read tcp private-address: i/o timeout", "transport_error", "warn"},
		{"WARN TCP error", "dial tcp: lookup private-destination: i/o timeout", "transport_error", "warn"},
		{"DEBUG TCP error", "some other failure", "transport_error", "debug"},
		{"TCP error", "some other failure", "transport_error", "unknown"},
	} {
		t.Run(row.heading+row.error, func(t *testing.T) {
			fields := map[string]any{"id": id, "error": row.error, "addr": "private-address", "reqAddr": "authentication-no recent network activity-private-destination", "password": "private-credential"}
			encoded, _ := json.Marshal(fields)
			console := row.heading + " " + string(encoded)
			fields["msg"], fields["level"] = "TCP error", row.level
			structured, _ := json.Marshal(fields)
			for _, message := range []any{console, journalBytes(console), "  " + string(structured)} {
				input := journalMessageEntry(message, "1700000001000000")
				result, err := scanConnectionEvents(strings.NewReader(input), "hysteria", id, 25)
				want := []connectionEvent{{SampledAt: 1700000001000, Engine: "hysteria", Type: "error", Reason: row.reason, Level: row.level, Count: 1}}
				if err != nil || !reflect.DeepEqual(result.Events, want) || result.Truncated {
					t.Fatalf("incorrect reason/level: %+v, %v", result, err)
				}
				output, _ := json.Marshal(result)
				if strings.Contains(string(output), "private-") || strings.Contains(string(output), "203.0.113") || strings.Contains(string(output), "2001:db8") || strings.Contains(string(output), "password") || strings.Contains(string(output), "\\u001b") {
					t.Fatal("raw error, address or credential escaped normalization")
				}
			}
		})
	}
}

func idleJournalEntry(id, address, heading, level string, at int64) string {
	message := level + " " + heading + ` {"id":"` + id + `","addr":"` + address + `","error":"timeout: no recent network activity","reqAddr":"private-destination"}`
	return journalMessageEntry(journalBytes(message), strconv.FormatInt(at*1000, 10))
}

func TestJournalGroupsSessionConsequencesBeforeApplyingEventLimit(t *testing.T) {
	id := "44e566b6-4c98-41cf-bb7b-03dc56ab17fc"
	const at int64 = 1700000002000
	input := idleJournalEntry(id, "private-session", "TCP error", "ERROR", at+10)
	input += idleJournalEntry(id, "private-session", "client disconnected", "INFO", at)
	for i := 0; i < 60; i++ {
		input += idleJournalEntry(id, "private-session", "TCP error", "WARN", at-int64(i)-1)
	}
	input += journalEntry(id, "1700000000000000", "")
	result, err := scanConnectionEvents(strings.NewReader(input), "hysteria", id, 2)
	want := connectionEvent{SampledAt: at, Engine: "hysteria", Type: "disconnected", Reason: "idle_timeout", Level: "info", Count: 62,
		FirstSampledAt: at - 60, LastSampledAt: at + 10,
		Related: []relatedConnectionEvent{{"error", "warn", 60}, {"error", "error", 1}}}
	if err != nil || result.Truncated || len(result.Events) != 2 || result.Events[0].Type != "connected" || !reflect.DeepEqual(result.Events[1], want) {
		t.Fatalf("session group lost causes, levels or earlier event: %+v, %v", result, err)
	}
	output, _ := json.Marshal(result)
	if strings.Contains(string(output), "private-") || strings.Contains(string(output), "addr") {
		t.Fatal("session correlation leaked a private key")
	}
	result, err = scanConnectionEvents(strings.NewReader(input), "hysteria", id, 1)
	if err != nil || !result.Truncated || len(result.Events) != 1 || result.Events[0].Count != 62 {
		t.Fatalf("latest group was split by the event budget: %+v, %v", result, err)
	}
}

func TestJournalDoesNotGuessSessionRelationships(t *testing.T) {
	id := "44e566b6-4c98-41cf-bb7b-03dc56ab17fc"
	const at int64 = 1700000002000
	root := idleJournalEntry(id, "private-session", "client disconnected", "INFO", at)
	for name, input := range map[string]string{
		"different session":    idleJournalEntry(id, "other-private-session", "TCP error", "WARN", at+1) + root,
		"missing address":      idleJournalEntry(id, "", "TCP error", "WARN", at+1) + root,
		"outside window":       idleJournalEntry(id, "private-session", "TCP error", "WARN", at+1001) + root,
		"missing disconnect":   idleJournalEntry(id, "private-session", "TCP error", "WARN", at),
		"reconnect boundary":   idleJournalEntry(id, "private-session", "TCP error", "WARN", at+2) + idleJournalEntry(id, "private-session", "client connected", "INFO", at+1) + root,
		"ambiguous disconnect": idleJournalEntry(id, "private-session", "client disconnected", "INFO", at+2) + idleJournalEntry(id, "private-session", "TCP error", "WARN", at+1) + root,
	} {
		t.Run(name, func(t *testing.T) {
			result, err := scanConnectionEvents(strings.NewReader(input), "hysteria", id, 25)
			if err != nil || result.Truncated || len(result.Events) != strings.Count(input, "\n") {
				t.Fatalf("unproven relationship was grouped: %+v, %v", result, err)
			}
			for _, event := range result.Events {
				if event.Count != 1 || len(event.Related) != 0 {
					t.Fatalf("unrelated event was hidden: %+v", event)
				}
			}
		})
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
