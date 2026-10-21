package policy

import (
	_ "embed"
	"encoding/json"
	"errors"
	"net/netip"
)

//go:embed public-addresses.json
var addressManifest []byte
var blockedAddresses []netip.Prefix
var globalIPv6 netip.Prefix

func init() {
	var value struct {
		Blocked    []string `json:"blocked"`
		IPv6Global string   `json:"ipv6Global"`
	}
	if err := json.Unmarshal(addressManifest, &value); err != nil {
		panic(err)
	}
	globalIPv6 = netip.MustParsePrefix(value.IPv6Global)
	for _, prefix := range value.Blocked {
		blockedAddresses = append(blockedAddresses, netip.MustParsePrefix(prefix))
	}
}

func PublicAddress(value string) bool {
	address, err := netip.ParseAddr(value)
	if err != nil || address.Zone() != "" || address.Is4In6() || address.Is6() && !globalIPv6.Contains(address) {
		return false
	}
	for _, prefix := range blockedAddresses {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}

func validatePing(payload map[string]any) error {
	address, validAddress := payload["address"].(string)
	count, validCount := payload["count"].(float64)
	if !validAddress || !PublicAddress(address) || !validCount || count < 1 || count > 30 || count != float64(int(count)) || len(payload) != 2 {
		return errors.New("ping requires a public IP and 1 to 30 packets")
	}
	return nil
}
