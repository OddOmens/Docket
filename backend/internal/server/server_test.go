package server

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/oddomens/docket/internal/store"
)

type env struct {
	t      *testing.T
	srv    *httptest.Server
	st     *store.Store
	cookie *http.Cookie
	tokens map[string]int
}

func newEnv(t *testing.T) *env {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "docket.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	web := fstest.MapFS{"index.html": {Data: []byte("<!doctype html><title>Docket</title>")}}
	s := New(Config{Version: "test"}, st, web, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if _, err := s.Bootstrap("Owner", "correct horse battery"); err != nil {
		t.Fatal(err)
	}
	e := &env{t: t, srv: httptest.NewServer(s.Handler()), st: st, tokens: map[string]int{}}
	t.Cleanup(e.srv.Close)
	res := e.do("POST", "/api/auth/login", "", `{"password":"correct horse battery"}`)
	if res.StatusCode != 200 {
		t.Fatalf("login: %d", res.StatusCode)
	}
	for _, c := range res.Cookies() {
		if c.Name == cookieName {
			e.cookie = c
		}
	}
	return e
}

// do sends a request; auth "" is anonymous, "cookie" the signed-in owner,
// anything else a bearer token.
func (e *env) do(method, path, auth, body string) *http.Response {
	e.t.Helper()
	req, _ := http.NewRequest(method, e.srv.URL+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	switch auth {
	case "":
	case "cookie":
		req.AddCookie(e.cookie)
		req.Header.Set("X-Client-Id", "test")
	default:
		req.Header.Set("Authorization", "Bearer "+auth)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	return res
}

func (e *env) json(res *http.Response, want int) map[string]any {
	e.t.Helper()
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != want {
		e.t.Fatalf("%s %s: status %d, want %d: %s", res.Request.Method, res.Request.URL.Path, res.StatusCode, want, b)
	}
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	return out
}

func (e *env) token(scope string) string {
	// Write tokens are named Claude, read tokens Reader; names must differ.
	name := map[string]string{"write": "Claude", "read": "Reader"}[scope]
	if e.tokens[scope]++; e.tokens[scope] > 1 {
		name = fmt.Sprintf("%s %d", name, e.tokens[scope])
	}
	out := e.json(e.do("POST", "/api/tokens", "cookie", `{"name":"`+name+`","scope":"`+scope+`","password":"correct horse battery"}`), 201)
	return out["token"].(string)
}

func TestAuthAndScopes(t *testing.T) {
	e := newEnv(t)
	e.json(e.do("GET", "/api/products", "", ""), 401)
	e.json(e.do("POST", "/api/products", "cookie", `{"name":"Coffer","key":"COF"}`), 201)

	// Cookie writes need X-Client-Id.
	req, _ := http.NewRequest("POST", e.srv.URL+"/api/items", strings.NewReader(`{"title":"x"}`))
	req.AddCookie(e.cookie)
	res, _ := http.DefaultClient.Do(req)
	e.json(res, 403)
	// And a foreign Origin is refused.
	req, _ = http.NewRequest("POST", e.srv.URL+"/api/items", strings.NewReader(`{"title":"x"}`))
	req.AddCookie(e.cookie)
	req.Header.Set("X-Client-Id", "t")
	req.Header.Set("Origin", "https://evil.example")
	res, _ = http.DefaultClient.Do(req)
	e.json(res, 403)

	ro, rw := e.token("read"), e.token("write")
	e.json(e.do("GET", "/api/products", ro, ""), 200)
	e.json(e.do("POST", "/api/items", ro, `{"title":"x","product":"COF"}`), 403)
	item := e.json(e.do("POST", "/api/items", rw, `{"title":"From Claude","product":"COF","severity":"high"}`), 201)
	if item["ref"] != "COF-1" || item["createdBy"] != "Claude" {
		t.Fatalf("%v", item)
	}
	// Tokens never reach the account, tokens, sessions or deletes of products.
	for _, p := range []string{"/api/account", "/api/tokens", "/api/sessions", "/api/events"} {
		e.json(e.do("GET", p, rw, ""), 403)
	}
	e.json(e.do("DELETE", "/api/products/COF?confirm=COF", rw, ""), 403)
	e.json(e.do("GET", "/api/products", "dkt_wrong", ""), 401)

	// Deleting a product needs its key as confirmation.
	e.json(e.do("DELETE", "/api/products/COF", "cookie", ""), 400)

	// Changing the password revokes tokens.
	e.json(e.do("POST", "/api/account/password", "cookie", `{"current":"correct horse battery","next":"another long password"}`), 204)
	e.json(e.do("GET", "/api/products", rw, ""), 401)
}

func TestItemAPI(t *testing.T) {
	e := newEnv(t)
	e.json(e.do("POST", "/api/products", "cookie", `{"name":"Quire","key":"QUI"}`), 201)
	e.json(e.do("POST", "/api/items", "cookie", `{"title":"A","product":"QUI","due":"2026-12-01"}`), 201)
	e.json(e.do("POST", "/api/items", "cookie", `{"title":"B","product":"QUI","severity":"bogus"}`), 400)
	e.json(e.do("PATCH", "/api/items/QUI-1", "cookie", `{"status":"in_progress"}`), 200)
	e.json(e.do("POST", "/api/items/QUI-1/comments", "cookie", `{"body":"Started"}`), 201)
	d := e.json(e.do("GET", "/api/items/QUI-1", "cookie", ""), 200)
	if len(d["thread"].([]any)) != 1 || len(d["activity"].([]any)) != 3 {
		t.Fatalf("%v", d)
	}
	l := e.json(e.do("GET", "/api/items?product=QUI&status=in_progress,review", "cookie", ""), 200)
	if l["total"].(float64) != 1 {
		t.Fatalf("%v", l)
	}
	c := e.json(e.do("GET", "/api/calendar?from=2026-11-01&to=2026-12-31", "cookie", ""), 200)
	if len(c["items"].([]any)) != 1 {
		t.Fatalf("%v", c)
	}
	e.json(e.do("GET", "/api/overview", "cookie", ""), 200)
	e.json(e.do("DELETE", "/api/items/QUI-1", "cookie", ""), 204)
	tr := e.json(e.do("GET", "/api/trash", "cookie", ""), 200)
	if tr["total"].(float64) != 1 {
		t.Fatalf("%v", tr)
	}
}

func rpc(e *env, token, body string) map[string]any {
	e.t.Helper()
	return e.json(e.do("POST", "/mcp", token, body), 200)
}

func TestMCP(t *testing.T) {
	e := newEnv(t)
	// Sessions can't use MCP; tokens can.
	e.json(e.do("POST", "/mcp", "cookie", `{"jsonrpc":"2.0","id":1,"method":"ping"}`), 401)
	rw, ro := e.token("write"), e.token("read")

	init := rpc(e, rw, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}`)
	if init["result"].(map[string]any)["protocolVersion"] != "2025-06-18" {
		t.Fatalf("%v", init)
	}
	if res := e.do("POST", "/mcp", rw, `{"jsonrpc":"2.0","method":"notifications/initialized"}`); res.StatusCode != 202 {
		t.Fatalf("notification: %d", res.StatusCode)
	}

	count := func(token string) int {
		r := rpc(e, token, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`)
		return len(r["result"].(map[string]any)["tools"].([]any))
	}
	if all, read := count(rw), count(ro); read >= all || read == 0 {
		t.Fatalf("tools: write %d, read %d", all, read)
	}

	call := func(token, name, args string) map[string]any {
		r := rpc(e, token, `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"`+name+`","arguments":`+args+`}}`)
		return r["result"].(map[string]any)
	}
	text := func(res map[string]any) string {
		return res["content"].([]any)[0].(map[string]any)["text"].(string)
	}
	if r := call(rw, "create_product", `{"name":"Salvo","key":"SAL","group":"Games"}`); r["isError"] == true {
		t.Fatal(text(r))
	}
	r := call(rw, "create_items", `{"items":[{"title":"Map editor","product":"SAL","type":"feature"},{"title":"Lag spike","product":"SAL","type":"bug","severity":"critical","labels":["netcode"]}]}`)
	if r["isError"] == true || !strings.Contains(text(r), "SAL-2") {
		t.Fatal(text(r))
	}
	if r := call(rw, "update_item", `{"ref":"SAL-2","status":"in_progress","append_body":"Repro: 40 players"}`); r["isError"] == true {
		t.Fatal(text(r))
	}
	if r := call(ro, "update_item", `{"ref":"SAL-2","status":"done"}`); r["isError"] != true {
		t.Fatal("read token wrote")
	}
	if r := call(rw, "update_item", `{"ref":"SAL-2","severity":"urgent"}`); r["isError"] != true || !strings.Contains(text(r), "severity must be one of") {
		t.Fatalf("bad severity: %v", r)
	}
	if r := call(rw, "update_item", `{"ref":"SAL-2","bogus":1}`); r["isError"] != true {
		t.Fatal("unknown argument accepted")
	}
	r = call(ro, "list_items", `{"product":"SAL","severity":["critical"]}`)
	if !strings.Contains(text(r), "Lag spike") || strings.Contains(text(r), "Map editor") {
		t.Fatal(text(r))
	}
	r = call(ro, "get_item", `{"ref":"sal-2"}`)
	if !strings.Contains(text(r), "Repro: 40 players") || !strings.Contains(text(r), `"actor": "Claude"`) {
		t.Fatal(text(r))
	}
	if r := call(ro, "overview", `{}`); r["isError"] == true {
		t.Fatal(text(r))
	}
	if r := rpc(e, rw, `{"jsonrpc":"2.0","id":9,"method":"nope"}`); r["error"] == nil {
		t.Fatal("unknown method answered")
	}
	// GET has no stream.
	if res := e.do("GET", "/mcp", rw, ""); res.StatusCode != 405 {
		t.Fatalf("GET /mcp: %d", res.StatusCode)
	}
}

func TestSnapshot(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "docket.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	snaps := filepath.Join(dir, "snapshots")
	s := New(Config{SnapshotDir: snaps, Snapshots: 2}, st, fstest.MapFS{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	for _, old := range []string{"docket-2020-01-01.db", "docket-2020-01-02.db"} {
		_ = os.MkdirAll(snaps, 0o700)
		_ = os.WriteFile(filepath.Join(snaps, old), nil, 0o600)
	}
	if err := s.snapshot(); err != nil {
		t.Fatal(err)
	}
	files, _ := filepath.Glob(filepath.Join(snaps, "docket-*.db"))
	if len(files) != 2 || !strings.HasSuffix(files[0], "2020-01-02.db") {
		t.Fatalf("%v", files)
	}
	if _, err := store.Open(files[1]); err != nil {
		t.Fatalf("snapshot doesn't open: %v", err)
	}
}
