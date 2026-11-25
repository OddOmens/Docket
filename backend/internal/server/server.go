// Package server is Docket's HTTP API, its MCP endpoint and the web UI.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"

	"github.com/oddomens/docket/internal/store"
)

type Config struct {
	Version string
	// TrustedProxies may set X-Forwarded-For. Loopback is always trusted, so
	// Tailscale Serve and a local reverse proxy work out of the box.
	TrustedProxies []netip.Prefix
	// Hosts are the names Docket answers to besides IP addresses, localhost
	// and Tailscale (*.ts.net) names. Any other Host header is refused, which
	// stops a web page from reaching Docket by pointing its own name at it
	// (DNS rebinding).
	Hosts []string
	// TrashRetention is how long deleted items stay restorable.
	TrashRetention time.Duration
	// SnapshotDir gets a copy of the database each day; "" turns that off.
	SnapshotDir string
	// Snapshots is how many daily copies are kept.
	Snapshots int
}

type Server struct {
	cfg    Config
	store  *store.Store
	events *hub
	log    *slog.Logger
	web    fs.FS

	limiter *limiter
	// verifies holds a slot for each password check running (maxVerifies).
	verifies chan struct{}
	// tokenLimiter caps API and MCP requests per token.
	tokenLimiter *rateLimiter

	// setupCode guards first-run account creation; it's printed to the log.
	setupMu   sync.Mutex
	setupCode string
}

func New(cfg Config, st *store.Store, web fs.FS, log *slog.Logger) *Server {
	if cfg.TrashRetention == 0 {
		cfg.TrashRetention = 30 * 24 * time.Hour
	}
	return &Server{cfg: cfg, store: st, web: web, log: log, events: newHub(), limiter: newLimiter(),
		verifies: make(chan struct{}, maxVerifies), tokenLimiter: newRateLimiter(600, time.Minute)}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	// read: a session or any API token. write: a session or a write token.
	// owner: a signed-in session only, never an API token.
	read := func(pattern string, h http.HandlerFunc) { mux.Handle(pattern, s.requireAuth(scopeRead, h)) }
	write := func(pattern string, h http.HandlerFunc) { mux.Handle(pattern, s.requireAuth(scopeWrite, h)) }
	owner := func(pattern string, h http.HandlerFunc) { mux.Handle(pattern, s.requireAuth(scopeOwner, h)) }

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": s.cfg.Version})
	})
	mux.HandleFunc("GET /api/auth/session", s.session)
	mux.HandleFunc("POST /api/auth/setup", s.setup)
	mux.HandleFunc("POST /api/auth/login", s.login)
	mux.HandleFunc("POST /api/auth/logout", s.logout)

	owner("GET /api/account", s.account)
	owner("PATCH /api/account", s.updateAccount)
	owner("POST /api/account/password", s.changePassword)
	owner("POST /api/account/2fa/setup", s.startTwoFactor)
	owner("POST /api/account/2fa/enable", s.enableTwoFactor)
	owner("POST /api/account/2fa/disable", s.disableTwoFactor)
	owner("POST /api/account/recovery-codes", s.newRecoveryCodes)
	owner("GET /api/sessions", s.sessions)
	owner("DELETE /api/sessions/{id}", s.revokeSession)
	owner("POST /api/sessions/revoke-others", s.revokeOtherSessions)
	owner("GET /api/tokens", s.listTokens)
	owner("POST /api/tokens", s.createToken)
	owner("DELETE /api/tokens/{id}", s.deleteToken)
	owner("GET /api/events", s.stream)

	read("GET /api/meta", s.meta)
	read("GET /api/overview", s.overview)
	read("GET /api/products", s.listProducts)
	read("GET /api/products/{key}", s.getProduct)
	write("POST /api/products", s.createProduct)
	write("PATCH /api/products/{key}", s.updateProduct)
	owner("DELETE /api/products/{key}", s.deleteProduct)
	write("POST /api/products/order", s.orderProducts)
	read("GET /api/groups", s.groups)
	write("POST /api/sections", s.createSection)
	write("PATCH /api/sections/{name}", s.renameSection)
	write("DELETE /api/sections/{name}", s.deleteSection)

	read("GET /api/items", s.listItems)
	read("GET /api/items/{ref}", s.getItem)
	write("POST /api/items", s.createItem)
	write("PATCH /api/items/{ref}", s.updateItem)
	write("DELETE /api/items/{ref}", s.deleteItem)
	write("POST /api/items/{ref}/restore", s.restoreItem)
	read("GET /api/items/{ref}/comments", s.listComments)
	write("POST /api/items/{ref}/comments", s.addComment)
	write("PATCH /api/comments/{id}", s.editComment)
	write("DELETE /api/comments/{id}", s.deleteComment)

	read("GET /api/trash", s.trash)
	owner("DELETE /api/trash/{ref}", s.purgeItem)
	owner("DELETE /api/trash", s.emptyTrash)

	read("GET /api/milestones", s.listMilestones)
	write("POST /api/milestones", s.createMilestone)
	write("PATCH /api/milestones/{id}", s.updateMilestone)
	write("DELETE /api/milestones/{id}", s.deleteMilestone)

	read("GET /api/labels", s.labels)
	read("GET /api/activity", s.activity)
	read("GET /api/calendar", s.calendar)
	read("GET /api/search", s.search)

	// MCP (Streamable HTTP): JSON-RPC over POST, API tokens only.
	mux.Handle("POST /mcp", s.requireAuth(scopeRead, http.HandlerFunc(s.mcp)))
	mux.HandleFunc("/mcp", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Allow", "POST")
		writeErr(w, http.StatusMethodNotAllowed, "the MCP endpoint takes POST only")
	})

	mux.Handle("/api/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeErr(w, http.StatusNotFound, "not found")
	}))
	mux.Handle("/", newSPA(s.web))

	return s.secure(s.logRequests(gzipJSON(mux, func(r *http.Request) bool {
		p := r.URL.Path
		return p == "/api/events" || strings.HasPrefix(p, "/api/auth/")
	})))
}

type ctxKey struct{}

type authInfo struct {
	sessionID string
	cookie    bool
	// token is set when an API token made the request.
	token *store.APIToken
}

func authOf(r *http.Request) authInfo {
	a, _ := r.Context().Value(ctxKey{}).(authInfo)
	return a
}

func sessionID(r *http.Request) string { return authOf(r).sessionID }

// actor names who made a change, for the activity log: the token's name
// ("Claude") or "You" for the owner in the web UI.
func actor(r *http.Request) string {
	if t := authOf(r).token; t != nil {
		return t.Name
	}
	return "You"
}

func withAuth(r *http.Request, a authInfo) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), ctxKey{}, a))
}

type apiError struct {
	Error string `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, apiError{Error: msg})
}

// readJSON decodes a request body of up to 1 MiB. Fields it doesn't know are
// ignored, so a newer client can talk to an older server.
func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

// fail maps store errors to responses.
func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	var inv *store.Invalid
	switch {
	case errors.As(err, &inv):
		writeErr(w, http.StatusBadRequest, inv.Msg)
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, http.StatusNotFound, "not found")
	default:
		s.log.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
		writeErr(w, http.StatusInternalServerError, "something went wrong")
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		if (strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/mcp") && r.URL.Path != "/api/events" {
			s.log.Debug("request", "method", r.Method, "path", r.URL.Path, "status", sw.status, "dur", time.Since(start).Round(time.Millisecond))
		}
	})
}

// pageCSP is the policy for the app's own pages: nothing from elsewhere,
// and nothing may frame Docket.
//
// Pictures in Markdown only load from Docket itself: a picture from another
// site would tell that site when you read an item, and an item written over
// the API could carry its text out in the picture's address.
const pageCSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; " +
	"frame-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"

// secure sets browser hardening headers and refuses cross-site writes.
func (s *Server) secure(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		if !s.allowedHost(r) {
			s.log.Warn("request for an unknown host refused; add it to DOCKET_HOSTS if it's yours", "host", r.Host)
			writeErr(w, http.StatusMisdirectedRequest, "Docket doesn't answer to this address. If it's yours, add the name to DOCKET_HOSTS.")
			return
		}
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		h.Set("Content-Security-Policy", pageCSP)
		if isHTTPS(r) {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		// A browser always sends Origin on a cross-site POST; refusing a
		// foreign one closes off CSRF. DNS rebinding is stopped by the Host
		// check above, since then the page's origin is its own name.
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
			if origin := r.Header.Get("Origin"); origin != "" && !s.sameOrigin(origin, r) {
				writeErr(w, http.StatusForbidden, "cross-origin request refused")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) sameOrigin(origin string, r *http.Request) bool {
	_, after, ok := strings.Cut(origin, "://")
	if !ok {
		return false
	}
	if strings.EqualFold(after, r.Host) {
		return true
	}
	// Behind a proxy that rewrites Host (Tailscale Serve, nginx), from a
	// proxy we trust only.
	fwd := r.Header.Get("X-Forwarded-Host")
	return fwd != "" && s.fromTrustedProxy(r) && strings.EqualFold(after, fwd) && s.knownHost(fwd)
}

func (s *Server) fromTrustedProxy(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	a, err := netip.ParseAddr(host)
	return err == nil && s.trusted(a)
}

// allowedHost reports whether the request is for a name Docket answers to.
// A forwarded host from a trusted proxy must be one too.
func (s *Server) allowedHost(r *http.Request) bool {
	if !s.knownHost(r.Host) {
		return false
	}
	if fwd := r.Header.Get("X-Forwarded-Host"); fwd != "" && s.fromTrustedProxy(r) {
		return s.knownHost(fwd)
	}
	return true
}

// knownHost is true for IP addresses, localhost, Tailscale names and the
// names in Config.Hosts, with or without a port.
func (s *Server) knownHost(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.ToLower(strings.TrimSuffix(strings.Trim(host, "[]"), "."))
	if host == "" {
		return false
	}
	if _, err := netip.ParseAddr(host); err == nil {
		return true
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".ts.net") {
		return true
	}
	for _, h := range s.cfg.Hosts {
		h = strings.ToLower(strings.TrimSuffix(h, "."))
		if host == h || (strings.HasPrefix(h, "*.") && strings.HasSuffix(host, h[1:])) {
			return true
		}
	}
	return false
}

// rateLimiter allows n requests per window for each key.
type rateLimiter struct {
	mu     sync.Mutex
	n      int
	window time.Duration
	hits   map[string][]time.Time
}

func newRateLimiter(n int, window time.Duration) *rateLimiter {
	return &rateLimiter{n: n, window: window, hits: map[string][]time.Time{}}
}

func (l *rateLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	cut := time.Now().Add(-l.window)
	ts := l.hits[key]
	i := 0
	for i < len(ts) && ts[i].Before(cut) {
		i++
	}
	ts = ts[i:]
	if len(ts) >= l.n {
		l.hits[key] = ts
		return false
	}
	l.hits[key] = append(ts, time.Now())
	return true
}

func (l *rateLimiter) sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	cut := time.Now().Add(-l.window)
	for k, ts := range l.hits {
		if len(ts) == 0 || ts[len(ts)-1].Before(cut) {
			delete(l.hits, k)
		}
	}
}
