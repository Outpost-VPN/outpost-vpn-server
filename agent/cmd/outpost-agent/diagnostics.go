package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os/exec"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Outpost-VPN/outpost-vpn-server/agent/internal/policy"
)

type connectionEvent struct {
	SampledAt int64  `json:"sampledAt"`
	Engine    string `json:"engine"`
	Type      string `json:"type"`
	Reason    string `json:"reason"`
}

const maxJournalBytes = 512 * 1024
const maxJournalLines = 1000

type connectionEvents struct {
	Events    []connectionEvent `json:"events"`
	Truncated bool              `json:"truncated"`
}

type journalMessage string

// journalctl encodes messages containing control bytes (including ANSI) as
// numeric byte arrays. Decode both forms before the shared event normalizer.
func (message *journalMessage) UnmarshalJSON(raw []byte) error {
	var text string
	if len(raw) > 0 && raw[0] == '[' {
		var octets []byte
		if err := json.Unmarshal(raw, &octets); err != nil {
			return err
		}
		if !utf8.Valid(octets) {
			return errors.New("journal MESSAGE is not valid UTF-8")
		}
		text = string(octets)
	} else if err := json.Unmarshal(raw, &text); err != nil {
		return err
	}
	*message = journalMessage(text)
	return nil
}

// Only normalized events leave the privileged boundary. Addresses, destinations,
// credentials and arbitrary journald text are never returned to the application.
func normalizeConnectionEvent(message, connection string) (string, string, bool) {
	identity := false
	start := strings.Index(message, "{")
	if start < 0 {
		return "", "", false
	}
	var fields map[string]any
	if json.Unmarshal([]byte(message[start:]), &fields) != nil {
		return "", "", false
	}
	for _, key := range []string{"id", "user", "email"} {
		value, ok := fields[key].(string)
		if ok && (value == connection || strings.HasPrefix(value, connection+".") && strings.HasSuffix(value, "@outpost.local")) {
			identity = true
		}
	}
	if !identity {
		return "", "", false
	}
	lower := strings.ToLower(message)
	event, reason := "error", "transport_error"
	if strings.Contains(lower, "client disconnected") {
		event, reason = "disconnected", "closed"
	} else if strings.Contains(lower, "client connected") {
		return "connected", "connected", true
	}
	if strings.Contains(lower, "no recent network activity") {
		reason = "idle_timeout"
	} else if strings.Contains(lower, "authentication") {
		reason = "authentication_failed"
	} else if strings.Contains(lower, "reset by peer") {
		reason = "connection_reset"
	}
	return event, reason, true
}

// journalctl supplies newest first. Only bounded, normalized events survive;
// a budget stops older input while retaining the latest observations.
func scanConnectionEvents(input io.Reader, engine, connection string, limit int) (connectionEvents, error) {
	result := connectionEvents{Events: []connectionEvent{}}
	bounded := &io.LimitedReader{R: input, N: maxJournalBytes + 1}
	scanner := bufio.NewScanner(bounded)
	scanner.Buffer(make([]byte, 4096), maxJournalBytes+2)
	bytes, lines := 0, 0
	for scanner.Scan() {
		bytes += len(scanner.Bytes()) + 1
		if bytes > maxJournalBytes {
			result.Truncated = true
			break
		}
		lines++
		var entry struct {
			Message   journalMessage `json:"MESSAGE"`
			Timestamp string         `json:"__REALTIME_TIMESTAMP"`
		}
		if json.Unmarshal(scanner.Bytes(), &entry) == nil {
			event, reason, ok := normalizeConnectionEvent(string(entry.Message), connection)
			micros, err := strconv.ParseInt(entry.Timestamp, 10, 64)
			if ok && err == nil && micros > 0 {
				if len(result.Events) == limit {
					result.Truncated = true
					break
				}
				result.Events = append(result.Events, connectionEvent{micros / 1000, engine, event, reason})
			}
		}
		if lines == maxJournalLines {
			result.Truncated = true
			break
		}
	}
	if bounded.N == 0 {
		result.Truncated = true
	}
	if err := scanner.Err(); err != nil && !result.Truncated {
		return result, err
	}
	slices.Reverse(result.Events)
	return result, nil
}

func readConnectionEvents(parent context.Context, payload map[string]any) (string, error) {
	engine := payload["engine"].(string)
	ctx, cancel := context.WithTimeout(parent, 4*time.Second)
	defer cancel()
	since := time.UnixMilli(int64(payload["since"].(float64))).UTC().Format(time.RFC3339)
	cmd := exec.CommandContext(ctx, "journalctl", "--unit="+policy.Engines[engine].Service, "--since="+since, "--until=now", "--output=json", "--output-fields=MESSAGE,__REALTIME_TIMESTAMP", "--reverse", "--lines=1000", "--no-pager")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	if err = cmd.Start(); err != nil {
		return "", err
	}
	result, readErr := scanConnectionEvents(stdout, engine, payload["connectionId"].(string), int(payload["limit"].(float64)))
	if result.Truncated || readErr != nil {
		cancel()
	}
	err = cmd.Wait()
	if parent.Err() != nil {
		return "", parent.Err()
	}
	if readErr != nil {
		return "", readErr
	}
	if err != nil && !result.Truncated {
		return "", err
	}
	encoded, err := json.Marshal(result)
	return string(encoded), err
}
