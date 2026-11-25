package server

import (
	"fmt"
	"net"
	"net/http"
	"net/netip"
)

// A warning is something the owner should look at: a setup detail that weakens a protection. Warnings are only
// shown to the signed-in owner.
type warning struct {
	// ID is stable, so a client can remember which ones it has shown.
	ID      string `json:"id"`
	Message string `json:"message"`
	// Section is the settings section where it's fixed.
	Section string `json:"section,omitempty"`
}

// warnings lists what needs the owner's attention. It's cheap: it reads
// in-memory backup state and the request itself.
func (s *Server) warnings(r *http.Request) []warning {
	out := []warning{}
	if addr, ok := s.untrustedProxy(r); ok {
		out = append(out, warning{ID: "untrusted-proxy", Section: "about",
			Message: fmt.Sprintf("Docket is reached through a proxy at %s that it doesn't trust, so every sign-in appears to come from that address (on Docker, usually the bridge network). If that proxy is yours, set DOCKET_TRUSTED_PROXIES, for example to %s, so sign-in limits and your device list see real addresses.", addr, netip.PrefixFrom(addr, addr.BitLen()))})
	}
	return out
}

// untrustedProxy reports a request that came from a private address that
// isn't a trusted proxy but still carries X-Forwarded-For: a reverse proxy
// (Tailscale Serve, nginx, Caddy) whose forwarded address Docket ignores. A
// public address with the header is left alone; that's more likely a
// proxy on the visitor's side.
func (s *Server) untrustedProxy(r *http.Request) (netip.Addr, bool) {
	if r.Header.Get("X-Forwarded-For") == "" {
		return netip.Addr{}, false
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}, false
	}
	addr = addr.Unmap()
	if s.trusted(addr) || !addr.IsPrivate() {
		return netip.Addr{}, false
	}
	return addr, true
}
