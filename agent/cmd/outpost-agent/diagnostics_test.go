package main

import "testing"

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
