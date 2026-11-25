package server

import (
	"net/http"
	"strings"
	"testing"
)

func TestUnknownHostRefused(t *testing.T) {
	e := newEnv(t)
	req, _ := http.NewRequest("GET", e.srv.URL+"/api/health", nil)
	req.Host = "evil.example:8200"
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusMisdirectedRequest {
		t.Fatalf("rebound host: status %d, want 421", res.StatusCode)
	}
	for _, h := range []string{"localhost:8200", "docket.tail1234.ts.net", "[::1]:8200", "10.1.2.3"} {
		req, _ := http.NewRequest("GET", e.srv.URL+"/api/health", nil)
		req.Host = h
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 200 {
			t.Errorf("host %s: status %d", h, res.StatusCode)
		}
	}
}

func TestKnownHostList(t *testing.T) {
	s := &Server{cfg: Config{Hosts: []string{"docket.example.com", "*.corp.example"}}}
	for h, want := range map[string]bool{
		"docket.example.com":      true,
		"DOCKET.example.com:443":  true,
		"a.corp.example":          true,
		"corp.example":            false,
		"docket.example.com.evil": false,
		"":                        false,
	} {
		if got := s.knownHost(h); got != want {
			t.Errorf("knownHost(%q) = %v", h, got)
		}
	}
}

func TestValidTokenNotLockedOut(t *testing.T) {
	e := newEnv(t)
	tok := e.token("read")
	for range maxFails + 2 {
		e.do("GET", "/api/products", "dkt_wrong", "").Body.Close()
	}
	e.json(e.do("GET", "/api/products", "dkt_wrong", ""), 429)
	e.json(e.do("GET", "/api/products", tok, ""), 200)
}

func TestTokenNeedsPasswordAndOwnName(t *testing.T) {
	e := newEnv(t)
	e.json(e.do("POST", "/api/tokens", "cookie", `{"name":"Bot","scope":"read"}`), 403)
	e.json(e.do("POST", "/api/tokens", "cookie", `{"name":"you","scope":"read","password":"correct horse battery"}`), 400)
	e.json(e.do("POST", "/api/tokens", "cookie", `{"name":"Bot","scope":"read","password":"correct horse battery"}`), 201)
	e.json(e.do("POST", "/api/tokens", "cookie", `{"name":"bot","scope":"read","password":"correct horse battery"}`), 400)
}

func TestNoRemoteImages(t *testing.T) {
	if strings.Contains(pageCSP, "https:") {
		t.Fatal("page CSP lets pictures load from other sites")
	}
}

func TestLimitKeyIPv6Prefix(t *testing.T) {
	if limitKey("2001:db8:1:2:aaaa::1") != limitKey("2001:db8:1:2:bbbb::9") {
		t.Error("addresses in one /64 should share a limit")
	}
	if limitKey("203.0.113.5") != "203.0.113.5" || limitKey("::ffff:203.0.113.5") != "203.0.113.5" {
		t.Error("IPv4 keyed by address")
	}
}
