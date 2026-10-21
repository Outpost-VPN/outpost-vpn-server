package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os/exec"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Outpost-VPN/outpost-vpn-server/agent/internal/policy"
)

type connectionEvent struct {
	SampledAt      int64                    `json:"sampledAt"`
	Engine         string                   `json:"engine"`
	Type           string                   `json:"type"`
	Reason         string                   `json:"reason"`
	Level          string                   `json:"level"`
	Count          int                      `json:"count"`
	FirstSampledAt int64                    `json:"firstSampledAt,omitempty"`
	LastSampledAt  int64                    `json:"lastSampledAt,omitempty"`
	Related        []relatedConnectionEvent `json:"related,omitempty"`
}

type relatedConnectionEvent struct {
	Type  string `json:"type"`
	Level string `json:"level"`
	Count int    `json:"count"`
}

// Correlation inputs never leave the privileged boundary, even as hashes.
type journalConnectionEvent struct {
	event   connectionEvent
	address string
	stream  bool
}

const maxJournalBytes = 512 * 1024
const maxJournalLines = 1000
const sessionEventWindowMs int64 = 1000

var journalANSI = regexp.MustCompile(`\x1b\[[0-?]*[ -/]*[@-~]`)
var consoleLogLevel = regexp.MustCompile(`^(?:\S+\s+)?(DEBUG|INFO|WARN|ERROR|DPANIC|PANIC|FATAL)(?:\s|$)`)
var remoteStreamCancellation = regexp.MustCompile(`^stream [0-9]+ cancell?ed by remote with error code [0-9]+$`)
var upstreamConnectTimeout = regexp.MustCompile(`^dial tcp[46]? \S+: i/o timeout$`)

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
func normalizeConnectionEvent(message, connection string) (journalConnectionEvent, bool) {
	message = strings.TrimSpace(message)
	identity := false
	start := strings.Index(message, "{")
	if start < 0 {
		return journalConnectionEvent{}, false
	}
	var fields map[string]any
	if json.Unmarshal([]byte(message[start:]), &fields) != nil {
		return journalConnectionEvent{}, false
	}
	for _, key := range []string{"id", "user", "email"} {
		value, ok := fields[key].(string)
		if ok && (value == connection || strings.HasPrefix(value, connection+".") && strings.HasSuffix(value, "@outpost.local")) {
			identity = true
		}
	}
	if !identity {
		return journalConnectionEvent{}, false
	}
	// Classify only the heading and error, never identity/address/destination
	// fields. Both console (including ANSI) and structured JSON use this owner.
	heading := journalANSI.ReplaceAllString(message[:start], "")
	levelText, _ := fields["level"].(string)
	if start == 0 {
		heading, _ = fields["msg"].(string)
	} else {
		levelText = ""
		if match := consoleLogLevel.FindStringSubmatch(heading); match != nil {
			levelText = match[1]
		}
	}
	heading = strings.ToLower(heading)
	level := "unknown"
	switch strings.ToLower(levelText) {
	case "debug", "info", "warn", "error", "dpanic", "panic", "fatal":
		level = strings.ToLower(levelText)
	}
	address, _ := fields["addr"].(string)
	result := journalConnectionEvent{event: connectionEvent{Type: "error", Reason: "transport_error", Level: level, Count: 1}, address: address,
		stream: strings.Contains(heading, "tcp error") || strings.Contains(heading, "udp error")}
	if strings.Contains(heading, "client disconnected") {
		result.event.Type, result.event.Reason = "disconnected", "closed"
	} else if strings.Contains(heading, "client connected") {
		result.event.Type, result.event.Reason = "connected", "connected"
		return result, true
	}
	errText, _ := fields["error"].(string)
	errText = strings.ToLower(errText)
	switch {
	case strings.Contains(errText, "no recent network activity"):
		result.event.Reason = "idle_timeout"
	case remoteStreamCancellation.MatchString(errText) && result.stream:
		result.event.Reason = "client_cancelled_stream"
	case upstreamConnectTimeout.MatchString(errText) && result.stream:
		result.event.Reason = "upstream_connect_timeout"
	case strings.Contains(errText, "authentication") || strings.Contains(heading, "authentication"):
		result.event.Reason = "authentication_failed"
	case strings.Contains(errText, "reset by peer"):
		result.event.Reason = "connection_reset"
	}
	return result, true
}

func (event *connectionEvent) addRelated(other connectionEvent) {
	if event.Count == 1 {
		event.FirstSampledAt, event.LastSampledAt = event.SampledAt, event.SampledAt
	}
	event.Count++
	event.FirstSampledAt = min(event.FirstSampledAt, other.SampledAt)
	event.LastSampledAt = max(event.LastSampledAt, other.SampledAt)
	for i := range event.Related {
		row := &event.Related[i]
		if row.Type == other.Type && row.Level == other.Level {
			row.Count++
			return
		}
	}
	event.Related = append(event.Related, relatedConnectionEvent{other.Type, other.Level, 1})
}

// Only stream consequences of one observed idle disconnect are grouped. A
// reconnect is a hard boundary; missing/ambiguous session evidence stays separate.
func groupConnectionEvents(records []journalConnectionEvent) []connectionEvent {
	type sessionKey struct {
		address string
		epoch   int
	}
	epochs := map[string]int{}
	keys := make([]sessionKey, len(records))
	roots := map[sessionKey][]int{}
	for i, row := range records {
		if row.event.Type == "connected" {
			epochs[row.address]++
		}
		keys[i] = sessionKey{row.address, epochs[row.address]}
		if row.address != "" && row.event.Type == "disconnected" && row.event.Reason == "idle_timeout" {
			roots[keys[i]] = append(roots[keys[i]], i)
		}
	}
	merged := make([]bool, len(records))
	for i, row := range records {
		if row.address == "" || !row.stream || row.event.Reason != "idle_timeout" {
			continue
		}
		root := -1
		for _, candidate := range roots[keys[i]] {
			delta := row.event.SampledAt - records[candidate].event.SampledAt
			if delta >= -sessionEventWindowMs && delta <= sessionEventWindowMs {
				if root != -1 {
					root = -1 // Two possible disconnects: do not guess.
					break
				}
				root = candidate
			}
		}
		if root != -1 {
			records[root].event.addRelated(row.event)
			merged[i] = true
		}
	}
	events := make([]connectionEvent, 0, len(records))
	for i, row := range records {
		if !merged[i] {
			events = append(events, row.event)
		}
	}
	return events
}

// journalctl supplies newest first. Only bounded, normalized events survive;
// a budget stops older input while retaining the latest observations.
func scanConnectionEvents(input io.Reader, engine, connection string, limit int) (connectionEvents, error) {
	result := connectionEvents{Events: []connectionEvent{}}
	var records []journalConnectionEvent
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
			row, ok := normalizeConnectionEvent(string(entry.Message), connection)
			micros, err := strconv.ParseInt(entry.Timestamp, 10, 64)
			if ok && err == nil && micros > 0 {
				row.event.SampledAt, row.event.Engine = micros/1000, engine
				records = append(records, row)
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
	slices.Reverse(records)
	result.Events = groupConnectionEvents(records)
	if len(result.Events) > limit {
		result.Truncated = true
		result.Events = result.Events[len(result.Events)-limit:]
	}
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
