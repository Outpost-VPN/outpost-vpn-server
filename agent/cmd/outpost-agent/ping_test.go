package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestPingChildProcess(t *testing.T) {
	switch os.Getenv("OUTPOST_TEST_PING_CHILD") {
	case "loss":
		fmt.Println("3 packets transmitted, 0 received, 100% packet loss, time 2000ms")
		fmt.Fprintln(os.Stderr, "private stderr")
		os.Exit(1)
	case "large":
		fmt.Print(strings.Repeat("x", maxPingBytes+1))
	case "wait":
		time.Sleep(30 * time.Second)
	}
}

func pingChild(ctx context.Context, mode string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestPingChildProcess$")
	cmd.Env = append(os.Environ(), "OUTPOST_TEST_PING_CHILD="+mode)
	return cmd
}

func TestPingPreservesLossEvidence(t *testing.T) {
	ctx := context.Background()
	output, err := runPingCommand(ctx, pingChild(ctx, "loss"))
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		Code   int    `json:"code"`
		Output string `json:"output"`
	}
	if json.Unmarshal([]byte(output), &result) != nil || result.Code != 1 || !strings.Contains(result.Output, "100% packet loss") || strings.Contains(output, "private") {
		t.Fatalf("lost bounded ping evidence: %s", output)
	}
}

func TestPingBoundsOutputAndCancellation(t *testing.T) {
	ctx := context.Background()
	if _, err := runPingCommand(ctx, pingChild(ctx, "large")); err == nil || !strings.Contains(err.Error(), "output limit") {
		t.Fatalf("output limit was not enforced: %v", err)
	}
	ctx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	cmd := pingChild(ctx, "wait")
	if _, err := runPingCommand(ctx, cmd); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("cancellation did not propagate: %v", err)
	}
	if cmd.ProcessState == nil {
		t.Fatal("cancelled subprocess was not reaped")
	}
}

func TestPingRejectsOverlappingWork(t *testing.T) {
	pingSlot <- struct{}{}
	defer func() { <-pingSlot }()
	if _, err := probePing(context.Background(), map[string]any{}); err == nil || !strings.Contains(err.Error(), "already running") {
		t.Fatalf("concurrent ping was not rejected: %v", err)
	}
}
