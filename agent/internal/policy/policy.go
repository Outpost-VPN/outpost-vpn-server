package policy

import (
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
)

var allowedServices = map[string]bool{
	"outpost":         true,
	"nginx":           true,
	"hysteria-server": true,
	"xray":            true,
}

var allowedEngineServices = map[string]bool{
	"hysteria-server": true,
	"xray":            true,
}

var allowedRoots = []string{
	"/opt/outpost",
	"/etc/outpost",
	"/var/lib/outpost",
}

type Request struct {
	Action  string         `json:"action"`
	Payload map[string]any `json:"payload"`
}

func Validate(request Request) error {
	switch request.Action {
	case "service.restart":
		service, ok := request.Payload["service"].(string)
		if !ok || !allowedServices[service] {
			return errors.New("service is not allowed")
		}
	case "service.start", "service.stop":
		service, ok := request.Payload["service"].(string)
		if !ok || !allowedEngineServices[service] {
			return errors.New("engine service is not allowed")
		}
	case "nginx.reload":
		return nil
	case "setup.finalize":
		domain, ok := request.Payload["domain"].(string)
		if !ok || !validDomain(domain) {
			return errors.New("valid domain is required")
		}
		address, ok := request.Payload["publicIp"].(string)
		if !ok || !validIPv4(address) {
			return errors.New("valid public IPv4 is required")
		}
		return nil
	case "engine.update":
		engine, ok := request.Payload["engine"].(string)
		if !ok || (engine != "hysteria" && engine != "xray") {
			return errors.New("engine is not allowed")
		}
		version, ok := request.Payload["version"].(string)
		if !ok || !safeVersion(version) {
			return errors.New("valid engine version is required")
		}
		checksum, ok := request.Payload["checksum"].(string)
		if !ok || !validSHA256(checksum) {
			return errors.New("valid sha256 checksum is required")
		}
		return nil
	case "update.apply":
		version, ok := request.Payload["version"].(string)
		if !ok || !safeVersion(version) {
			return errors.New("valid application version is required")
		}
		operationID, ok := request.Payload["operationId"].(string)
		if !ok || !validOperationID(operationID) {
			return errors.New("valid operation id is required")
		}
		if err := requirePath(request.Payload, "bundle", "/var/lib/outpost/incoming"); err != nil {
			return err
		}
		if err := requirePath(request.Payload, "signature", "/var/lib/outpost/incoming"); err != nil {
			return err
		}
		bundle := request.Payload["bundle"].(string)
		signature := request.Payload["signature"].(string)
		expected := filepath.Join("/var/lib/outpost/incoming", "outpost-"+version+"-linux-amd64.tar.gz")
		if bundle != expected || signature != expected+".minisig" {
			return errors.New("application archive does not match version")
		}
		return nil
	case "backup.export":
		if err := requirePath(request.Payload, "output", "/var/lib/outpost/backups"); err != nil {
			return err
		}
		if passphrase, ok := request.Payload["passphrase"]; ok {
			value, valid := passphrase.(string)
			if !valid || len(value) < 12 || len(value) > 200 {
				return errors.New("passphrase must contain 12 to 200 characters")
			}
		}
		return nil
	case "config.apply":
		if err := requirePath(request.Payload, "source", "/var/lib/outpost"); err != nil {
			return err
		}
		if err := requirePath(request.Payload, "target", "/etc/outpost/engines"); err != nil {
			return err
		}
		engine, ok := request.Payload["engine"].(string)
		if !ok || (engine != "hysteria" && engine != "xray") {
			return errors.New("engine is not allowed")
		}
		if restart, ok := request.Payload["restart"]; ok {
			if _, valid := restart.(bool); !valid {
				return errors.New("restart must be boolean")
			}
		}
		return nil
	case "xray.user.add":
		if err := requirePath(request.Payload, "source", "/var/lib/outpost/runtime"); err != nil {
			return err
		}
		return requirePath(request.Payload, "rendered", "/var/lib/outpost/runtime")
	case "xray.user.revoke":
		email, ok := request.Payload["email"].(string)
		if !ok || len(email) < 10 || len(email) > 200 {
			return errors.New("valid email is required")
		}
		return requirePath(request.Payload, "rendered", "/var/lib/outpost/runtime")
	default:
		return errors.New("action is not allowed")
	}
	return nil
}

func safeVersion(value string) bool {
	if len(value) < 1 || len(value) > 40 || value[0] < '0' || value[0] > '9' {
		return false
	}
	for _, char := range value {
		if (char < '0' || char > '9') && (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') && char != '.' && char != '-' {
			return false
		}
	}
	return true
}

func validSHA256(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, char := range value {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') {
			return false
		}
	}
	return true
}

func validOperationID(value string) bool {
	if len(value) != 36 || value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-' {
		return false
	}
	for index, char := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			continue
		}
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') && (char < 'A' || char > 'F') {
			return false
		}
	}
	return true
}

func validDomain(value string) bool {
	if len(value) < 4 || len(value) > 253 || value[0] == '.' || value[len(value)-1] == '.' || validIPv4(value) {
		return false
	}
	dots := 0
	labelLength := 0
	for index, char := range value {
		if char == '.' {
			if labelLength == 0 || value[index-1] == '-' {
				return false
			}
			dots++
			labelLength = 0
			continue
		}
		if labelLength == 0 && char == '-' {
			return false
		}
		if (char < 'a' || char > 'z') && (char < '0' || char > '9') && char != '-' {
			return false
		}
		labelLength++
		if labelLength > 63 {
			return false
		}
	}
	suffix := value[strings.LastIndex(value, ".")+1:]
	hasLetter := false
	for _, char := range suffix {
		hasLetter = hasLetter || (char >= 'a' && char <= 'z')
	}
	return dots > 0 && labelLength > 0 && value[len(value)-1] != '-' && hasLetter
}

func validIPv4(value string) bool {
	parts := strings.Split(value, ".")
	if len(parts) != 4 {
		return false
	}
	for _, part := range parts {
		if len(part) == 0 || len(part) > 3 {
			return false
		}
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 || number > 255 {
			return false
		}
	}
	return true
}

func requirePath(payload map[string]any, key, root string) error {
	value, ok := payload[key].(string)
	if !ok || value == "" {
		return fmt.Errorf("%s path is required", key)
	}
	clean := filepath.Clean(value)
	relative, err := filepath.Rel(root, clean)
	if err != nil || relative == ".." || filepath.IsAbs(relative) || relative == "." || hasParentPrefix(relative) {
		return fmt.Errorf("%s path is outside allowed root", key)
	}
	return nil
}

func IsAllowedRoot(path string) bool {
	clean := filepath.Clean(path)
	for _, root := range allowedRoots {
		relative, err := filepath.Rel(root, clean)
		if err == nil && relative != ".." && !filepath.IsAbs(relative) && !hasParentPrefix(relative) {
			return true
		}
	}
	return false
}

func hasParentPrefix(relative string) bool {
	return len(relative) >= 3 && relative[:3] == ".."+string(filepath.Separator)
}
