package policy

import "testing"

func TestServiceAllowlist(t *testing.T) {
	good := Request{Action: "service.restart", Payload: map[string]any{"service": "xray"}}
	if err := Validate(good); err != nil {
		t.Fatalf("allowed service rejected: %v", err)
	}
	bad := Request{Action: "service.restart", Payload: map[string]any{"service": "sshd"}}
	if err := Validate(bad); err == nil {
		t.Fatal("unexpected service accepted")
	}
	stop := Request{Action: "service.stop", Payload: map[string]any{"service": "hysteria-server"}}
	if err := Validate(stop); err != nil {
		t.Fatalf("allowed engine service rejected: %v", err)
	}
	protected := Request{Action: "service.stop", Payload: map[string]any{"service": "outpost"}}
	if err := Validate(protected); err == nil {
		t.Fatal("protected service accepted")
	}
}

func TestRejectsPathTraversal(t *testing.T) {
	request := Request{Action: "config.apply", Payload: map[string]any{
		"source": "/var/lib/outpost/rendered/xray.json",
		"target": "/etc/outpost/../../etc/shadow",
		"engine": "xray",
	}}
	if err := Validate(request); err == nil {
		t.Fatal("path traversal accepted")
	}
}

func TestConfigEngineAllowlist(t *testing.T) {
	request := Request{Action: "config.apply", Payload: map[string]any{
		"source": "/var/lib/outpost/runtime/xray.json",
		"target": "/etc/outpost/engines/xray.json",
		"engine": "shell",
	}}
	if err := Validate(request); err == nil {
		t.Fatal("unexpected engine accepted")
	}
	withoutRestart := Request{Action: "config.apply", Payload: map[string]any{
		"source":  "/var/lib/outpost/runtime/xray.json",
		"target":  "/etc/outpost/engines/xray.json",
		"engine":  "xray",
		"restart": false,
	}}
	if err := Validate(withoutRestart); err != nil {
		t.Fatalf("boolean restart flag rejected: %v", err)
	}
	withoutRestart.Payload["restart"] = "false"
	if err := Validate(withoutRestart); err == nil {
		t.Fatal("non-boolean restart flag accepted")
	}
}

func TestBackupPassphraseAndPath(t *testing.T) {
	good := Request{Action: "backup.export", Payload: map[string]any{
		"output":     "/var/lib/outpost/backups/operation.age",
		"passphrase": "correct horse battery staple",
	}}
	if err := Validate(good); err != nil {
		t.Fatalf("valid backup rejected: %v", err)
	}
	bad := Request{Action: "backup.export", Payload: map[string]any{
		"output":     "/var/lib/outpost/backups/operation.age",
		"passphrase": "short",
	}}
	if err := Validate(bad); err == nil {
		t.Fatal("weak passphrase accepted")
	}
	plain := Request{Action: "backup.export", Payload: map[string]any{
		"output": "/var/lib/outpost/backups/operation.tar",
	}}
	if err := Validate(plain); err != nil {
		t.Fatalf("unencrypted backup rejected: %v", err)
	}
}

func TestEngineUpdatePinsStructuredValues(t *testing.T) {
	good := Request{Action: "engine.update", Payload: map[string]any{
		"engine": "xray", "version": "26.4.1", "checksum": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}}
	if err := Validate(good); err != nil {
		t.Fatalf("valid engine update rejected: %v", err)
	}
	bad := Request{Action: "engine.update", Payload: map[string]any{
		"engine": "xray", "version": "../../bin/sh", "checksum": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}}
	if err := Validate(bad); err == nil {
		t.Fatal("unsafe engine version accepted")
	}
}

func TestApplicationUpdateRequiresBundleAndSignatureInsideIncoming(t *testing.T) {
	good := Request{Action: "update.apply", Payload: map[string]any{
		"version":     "0.1.1",
		"operationId": "12345678-1234-4234-8234-123456789abc",
		"bundle":      "/var/lib/outpost/incoming/outpost-0.1.1-linux-amd64.tar.gz",
		"signature":   "/var/lib/outpost/incoming/outpost-0.1.1-linux-amd64.tar.gz.minisig",
	}}
	if err := Validate(good); err != nil {
		t.Fatalf("signed application update rejected: %v", err)
	}
	missing := Request{Action: "update.apply", Payload: map[string]any{
		"version":     "0.1.1",
		"operationId": "12345678-1234-4234-8234-123456789abc",
		"bundle":      "/var/lib/outpost/incoming/outpost-0.1.1-linux-amd64.tar.gz",
	}}
	if err := Validate(missing); err == nil {
		t.Fatal("unsigned application update accepted")
	}
	outside := Request{Action: "update.apply", Payload: map[string]any{
		"version":     "0.1.1",
		"operationId": "12345678-1234-4234-8234-123456789abc",
		"bundle":      "/var/lib/outpost/incoming/outpost-0.1.1-linux-amd64.tar.gz",
		"signature":   "/tmp/update.tar.gz.minisig",
	}}
	if err := Validate(outside); err == nil {
		t.Fatal("signature outside incoming directory accepted")
	}
	mismatch := Request{Action: "update.apply", Payload: map[string]any{
		"version":     "0.1.2",
		"operationId": "12345678-1234-4234-8234-123456789abc",
		"bundle":      "/var/lib/outpost/incoming/outpost-0.1.1-linux-amd64.tar.gz",
		"signature":   "/var/lib/outpost/incoming/outpost-0.1.1-linux-amd64.tar.gz.minisig",
	}}
	if err := Validate(mismatch); err == nil {
		t.Fatal("application update version not bound to archive")
	}
	badID := Request{Action: "update.apply", Payload: map[string]any{
		"version":     "0.1.1",
		"operationId": "../../etc/passwd",
		"bundle":      "/var/lib/outpost/incoming/outpost-0.1.1-linux-amd64.tar.gz",
		"signature":   "/var/lib/outpost/incoming/outpost-0.1.1-linux-amd64.tar.gz.minisig",
	}}
	if err := Validate(badID); err == nil {
		t.Fatal("unsafe application update operation id accepted")
	}
}

func TestSetupFinalizeAcceptsOnlyStructuredDomainAndIPv4(t *testing.T) {
	good := Request{Action: "setup.finalize", Payload: map[string]any{
		"domain": "proxy.example.com", "publicIp": "203.0.113.42",
	}}
	if err := Validate(good); err != nil {
		t.Fatalf("valid setup rejected: %v", err)
	}
	badDomain := Request{Action: "setup.finalize", Payload: map[string]any{
		"domain": "proxy.example.com;id", "publicIp": "203.0.113.42",
	}}
	if err := Validate(badDomain); err == nil {
		t.Fatal("unsafe domain accepted")
	}
	badAddress := Request{Action: "setup.finalize", Payload: map[string]any{
		"domain": "proxy.example.com", "publicIp": "203.0.113.999",
	}}
	if err := Validate(badAddress); err == nil {
		t.Fatal("invalid IPv4 accepted")
	}
	numericDomain := Request{Action: "setup.finalize", Payload: map[string]any{
		"domain": "203.0.113.42", "publicIp": "203.0.113.42",
	}}
	if err := Validate(numericDomain); err == nil {
		t.Fatal("IP address accepted as a permanent domain")
	}
}

func TestNoArbitraryAction(t *testing.T) {
	request := Request{Action: "shell", Payload: map[string]any{"command": "id"}}
	if err := Validate(request); err == nil {
		t.Fatal("arbitrary action accepted")
	}
}
