package main

import (
	"context"
	"encoding/json"
	"io"
	"os/exec"
	"strings"
	"time"

	"github.com/Outpost-VPN/outpost-vpn-server/agent/internal/policy"
)

type connectionEvent struct {
	SampledAt int64  `json:"sampledAt"`
	Engine    string `json:"engine"`
	Type      string `json:"type"`
	Reason    string `json:"reason"`
}

// Only normalized events leave the privileged boundary. Addresses, destinations,
// credentials and arbitrary journald text are never returned to the application.
func normalizeConnectionEvent(message, connection string) (string, string, bool) {
	identity := false
	for _, key := range []string{"id", "user", "email"} {
		start := strings.Index(message, "{")
		if start < 0 {
			continue
		}
		var fields map[string]any
		if json.Unmarshal([]byte(message[start:]), &fields) == nil {
			value, ok := fields[key].(string)
			if ok && (value == connection || strings.HasPrefix(value, connection+".") && strings.HasSuffix(value, "@outpost.local")) {
				identity = true
			}
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

func readConnectionEvents(payload map[string]any) (string, error) {
	engine := payload["engine"].(string)
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	since := time.UnixMilli(int64(payload["since"].(float64))).UTC().Format(time.RFC3339)
	cmd := exec.CommandContext(ctx, "journalctl", "--unit="+policy.Engines[engine].Service, "--since="+since, "--until=now", "--output=json", "--lines=1000", "--no-pager")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	if err = cmd.Start(); err != nil {
		return "", err
	}
	raw, readErr := io.ReadAll(io.LimitReader(stdout, 512*1024+1))
	if readErr != nil || len(raw) > 512*1024 {
		_ = cmd.Process.Kill()
	}
	err = cmd.Wait()
	if err != nil {
		return "", err
	}
	rows := []connectionEvent{}
	for _, line := range strings.Split(string(raw), "\n") {
		var entry struct {
			Message   string `json:"MESSAGE"`
			Timestamp string `json:"__REALTIME_TIMESTAMP"`
		}
		if json.Unmarshal([]byte(line), &entry) != nil {
			continue
		}
		event, reason, ok := normalizeConnectionEvent(entry.Message, payload["connectionId"].(string))
		if !ok {
			continue
		}
		var micros int64
		for _, c := range entry.Timestamp {
			if c < '0' || c > '9' {
				micros = 0
				break
			}
			micros = micros*10 + int64(c-'0')
		}
		rows = append(rows, connectionEvent{micros / 1000, engine, event, reason})
	}
	limit := int(payload["limit"].(float64))
	if len(rows) > limit {
		rows = rows[len(rows)-limit:]
	}
	encoded, err := json.Marshal(map[string]any{"events": rows, "truncated": len(raw) > 512*1024})
	return string(encoded), err
}
