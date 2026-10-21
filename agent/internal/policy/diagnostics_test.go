package policy

import (
	"testing"
	"time"
)

func TestManagedLogReadBoundary(t *testing.T) {
	base := map[string]any{"engine": "hysteria", "connectionId": "44e566b6-4c98-41cf-bb7b-03dc56ab17fc", "since": float64(time.Now().Add(-time.Minute).UnixMilli()), "limit": float64(25)}
	if err := Validate(Request{Action: "logs.read", Payload: base}); err != nil {
		t.Fatal(err)
	}
	for key, value := range map[string]any{"engine": "ssh", "connectionId": "--unit=ssh", "since": float64(0), "limit": float64(10000), "command": "id"} {
		changed := map[string]any{}
		for k, v := range base {
			changed[k] = v
		}
		changed[key] = value
		if Validate(Request{Action: "logs.read", Payload: changed}) == nil {
			t.Fatalf("accepted invalid %s", key)
		}
	}
}
