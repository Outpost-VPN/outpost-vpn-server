package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const maxPingBytes = 64 * 1024

var pingSlot = make(chan struct{}, 1)

func probePing(parent context.Context, payload map[string]any) (string, error) {
	if err := parent.Err(); err != nil {
		return "", err
	}
	select {
	case pingSlot <- struct{}{}:
		defer func() { <-pingSlot }()
	default:
		return "", errors.New("an ICMP probe is already running")
	}
	count := int(payload["count"].(float64))
	address := payload["address"].(string)
	ctx, cancel := context.WithTimeout(parent, time.Duration(count*1200+2000)*time.Millisecond)
	defer cancel()
	family := "-4"
	if strings.Contains(address, ":") {
		family = "-6"
	}
	cmd := exec.CommandContext(ctx, "/usr/bin/ping", family, "-n", "-c", strconv.Itoa(count), "-i", "0.2", "-W", "1", "--", address)
	cmd.Env = append(os.Environ(), "LC_ALL=C")
	return runPingCommand(ctx, cmd)
}

// Nonzero ping exit codes carry loss/unavailability evidence for the shared
// application parser. Raw stderr is never exposed across the agent boundary.
func runPingCommand(ctx context.Context, cmd *exec.Cmd) (string, error) {
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	if err = cmd.Start(); err != nil {
		return "", err
	}
	output, readErr := io.ReadAll(io.LimitReader(stdout, maxPingBytes+1))
	if readErr != nil || len(output) > maxPingBytes {
		_ = cmd.Process.Kill()
	}
	err = cmd.Wait()
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if readErr != nil {
		return "", readErr
	}
	if len(output) > maxPingBytes {
		return "", errors.New("ping output limit exceeded")
	}
	code := 0
	if err != nil {
		var exited *exec.ExitError
		if !errors.As(err, &exited) {
			return "", err
		}
		code = exited.ExitCode()
	}
	result, err := json.Marshal(struct {
		Code   int    `json:"code"`
		Output string `json:"output"`
	}{code, string(output)})
	return string(result), err
}
