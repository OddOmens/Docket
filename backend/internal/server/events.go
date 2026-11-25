package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Events tell open web clients something changed (from another tab, a
// phone, or Claude over MCP), so their views refresh. A client sends
// X-Client-Id with its writes and ignores events carrying its own id.

type event struct {
	Type string `json:"type"` // always "change"
	// Kinds is what changed: items, products, milestones, comments.
	Kinds  []string `json:"kinds"`
	Origin string   `json:"origin,omitempty"`
}

type hub struct {
	mu   sync.Mutex
	subs map[chan event]struct{}
}

func newHub() *hub { return &hub{subs: map[chan event]struct{}{}} }

// maxStreams caps open event streams, so a buggy client can't hold
// unbounded connections.
const maxStreams = 64

func (h *hub) subscribe() (chan event, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.subs) >= maxStreams {
		return nil, false
	}
	ch := make(chan event, 32)
	h.subs[ch] = struct{}{}
	return ch, true
}

func (h *hub) unsubscribe(ch chan event) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
}

func (h *hub) send(e event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- e:
		default: // A stalled client misses an event; it refetches on reconnect.
		}
	}
}

func (s *Server) publish(r *http.Request, kinds ...string) {
	origin := ""
	if r != nil {
		origin = r.Header.Get("X-Client-Id")
	}
	s.events.send(event{Type: "change", Kinds: kinds, Origin: origin})
}

func (s *Server) stream(w http.ResponseWriter, r *http.Request) {
	ch, ok := s.events.subscribe()
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "too many open connections")
		return
	}
	defer s.events.unsubscribe(ch)
	rc := http.NewResponseController(w)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, "retry: 3000\n\n")
	if err := rc.Flush(); err != nil {
		return
	}
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case e := <-ch:
			b, _ := json.Marshal(e)
			fmt.Fprintf(w, "data: %s\n\n", b)
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
		}
		_ = rc.SetWriteDeadline(time.Now().Add(30 * time.Second))
		if err := rc.Flush(); err != nil {
			return
		}
	}
}

// Maintain runs the hourly housekeeping until ctx ends: old trash, expired
// sessions and tokens, and stale rate-limit records, so a server left alone
// for years doesn't slowly grow.
func (s *Server) Maintain(ctx context.Context) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		s.maintain()
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (s *Server) maintain() {
	n, err := s.store.Tidy(s.cfg.TrashRetention)
	if err != nil {
		s.log.Warn("tidy database", "err", err)
	}
	if n > 0 {
		s.log.Info("emptied old trash", "items", n)
	}
	s.limiter.sweep()
	s.tokenLimiter.sweep()
	if err := s.snapshot(); err != nil {
		s.log.Warn("daily database snapshot", "err", err)
	}
}

// snapshot keeps one copy of the database per day in cfg.SnapshotDir, and
// the newest cfg.Snapshots of them, so a mistake (or a bad import by a
// script) can be undone even without outside backups.
func (s *Server) snapshot() error {
	dir := s.cfg.SnapshotDir
	if dir == "" || s.cfg.Snapshots <= 0 {
		return nil
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	name := filepath.Join(dir, "docket-"+time.Now().Format(time.DateOnly)+".db")
	if _, err := os.Stat(name); err == nil {
		return nil
	}
	tmp := name + ".part"
	_ = os.Remove(tmp)
	if err := s.store.Backup(tmp); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	_ = os.Chmod(tmp, 0o600)
	if err := os.Rename(tmp, name); err != nil {
		return err
	}
	old, _ := filepath.Glob(filepath.Join(dir, "docket-*.db"))
	sort.Strings(old)
	for len(old) > s.cfg.Snapshots {
		_ = os.Remove(old[0])
		old = old[1:]
	}
	s.log.Info("saved daily database snapshot", "file", name)
	return nil
}
