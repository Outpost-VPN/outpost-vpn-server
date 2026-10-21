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

func TestPingBoundary(t *testing.T) {
	for _, address := range []string{"1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"} {
		for _, count := range []float64{1, 30} {
			if err := Validate(Request{Action: "network.ping", Payload: map[string]any{"address": address, "count": count}}); err != nil {
				t.Fatalf("rejected %s: %v", address, err)
			}
		}
	}
	for _, address := range []string{"127.0.0.1", "10.0.0.1", "169.254.169.254", "168.63.129.16", "192.168.1.1", "198.18.0.1", "224.0.0.1", "::1", "::ffff:8.8.8.8", "fd00::1", "fe80::1", "2001:db8::1", "2606:4700::1%eth0", "example.com", "1.1.1.1;id", "--help"} {
		if Validate(Request{Action: "network.ping", Payload: map[string]any{"address": address, "count": float64(1)}}) == nil {
			t.Fatalf("accepted unsafe address %s", address)
		}
	}
	for _, payload := range []map[string]any{
		{"address": "1.1.1.1", "count": float64(0)}, {"address": "1.1.1.1", "count": float64(31)},
		{"address": "1.1.1.1", "count": 1.5}, {"address": "1.1.1.1", "count": "1"},
		{"address": "1.1.1.1"}, {"address": "1.1.1.1", "count": float64(1), "command": "id"},
	} {
		if Validate(Request{Action: "network.ping", Payload: payload}) == nil {
			t.Fatal("accepted invalid ping arguments")
		}
	}
}
