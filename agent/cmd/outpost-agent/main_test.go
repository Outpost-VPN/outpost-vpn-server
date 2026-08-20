package main

import "testing"

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
