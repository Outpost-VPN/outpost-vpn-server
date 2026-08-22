package main

import "testing"

func TestApplicationUpdateRunsOutsideAgentServiceCgroup(t *testing.T) {
	payload := map[string]any{
		"bundle":      "/var/lib/outpost/incoming/outpost-0.1.1-linux-amd64.tar.gz",
		"signature":   "/var/lib/outpost/incoming/outpost-0.1.1-linux-amd64.tar.gz.minisig",
		"version":     "0.1.1",
		"operationId": "12345678-1234-4234-8234-123456789abc",
	}

	command := applicationUpdateCommand(payload)
	if command[0] != "systemd-run" {
		t.Fatalf("application update executable = %q, want systemd-run", command[0])
	}
	if command[4] != "--unit" || command[5] != "outpost-update-"+payload["operationId"].(string) {
		t.Fatalf("transient unit name = %q", command[5])
	}
	if command[6] != "/opt/outpost/current/infra/scripts/apply-update" {
		t.Fatalf("transient unit executable = %q", command[6])
	}
	for _, argument := range command {
		if argument == "--pipe" {
			t.Fatal("application update output must remain attached to the transient unit journal")
		}
	}
	if command[len(command)-1] != payload["operationId"] {
		t.Fatalf("operation ID was not forwarded")
	}
}

func TestXrayUserUpdateSucceeded(t *testing.T) {
	tests := []struct {
		name   string
		output string
		action string
		want   bool
	}{
		{name: "added", output: "processing inbound: vless-xhttp\nprocessing inbound: vless-grpc\nAdded 2 user(s) in total.", action: "Added", want: true},
		{name: "removed", output: "Removed 1 user(s) in total.\nRemoved 1 user(s) in total.", action: "Removed", want: true},
		{name: "partial remove", output: "Removed 1 user(s) in total.", action: "Removed", want: false},
		{name: "silent add failure", output: "failed to build config: no Port(s) set\nAdded 0 user(s) in total.", action: "Added", want: false},
		{name: "wrong operation", output: "Removed 2 user(s) in total.", action: "Added", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := xrayUserUpdateSucceeded(test.output, test.action, 2); got != test.want {
				t.Fatalf("xrayUserUpdateSucceeded() = %v, want %v", got, test.want)
			}
		})
	}
}
