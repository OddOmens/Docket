package server

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/oddomens/docket/internal/store"
)

// ── Meta ──

type metaInfo struct {
	ProductStatuses []string `json:"productStatuses"`
	ItemTypes       []string `json:"itemTypes"`
	ItemStatuses    []string `json:"itemStatuses"`
	Severities      []string `json:"severities"`
	InboxKey        string   `json:"inboxKey"`
	Today           string   `json:"today"`
	Version         string   `json:"version"`
}

func (s *Server) metaInfo() metaInfo {
	return metaInfo{store.ProductStatuses, store.ItemTypes, store.ItemStatuses, store.Severities, store.InboxKey, store.Today(), s.cfg.Version}
}

func (s *Server) meta(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.metaInfo())
}

// ── Overview ──

type overview struct {
	Today      string           `json:"today"`
	Products   []*store.Product `json:"products"`
	Totals     store.Totals     `json:"totals"`
	Urgent     []*store.Item    `json:"urgent"`
	DueSoon    []*store.Item    `json:"dueSoon"`
	InProgress []*store.Item    `json:"inProgress"`
	Recent     []store.Activity `json:"recent"`
}

func (s *Server) buildOverview() (*overview, error) {
	o := &overview{Today: store.Today()}
	var err error
	if o.Products, err = s.store.Products(); err != nil {
		return nil, err
	}
	if o.Totals, err = s.store.Totals(); err != nil {
		return nil, err
	}
	if o.Urgent, _, err = s.store.Items(store.Filter{Open: true, Severity: []string{"critical", "high"}, Sort: "severity", Limit: 25}); err != nil {
		return nil, err
	}
	soon := time.Now().AddDate(0, 0, 14).Format(time.DateOnly)
	if o.DueSoon, _, err = s.store.Items(store.Filter{Open: true, DueTo: soon, Sort: "due", Limit: 25}); err != nil {
		return nil, err
	}
	if o.InProgress, _, err = s.store.Items(store.Filter{Status: []string{"in_progress", "review"}, Sort: "updated", Limit: 25}); err != nil {
		return nil, err
	}
	if o.Recent, err = s.store.Activity(store.ActivityFilter{Limit: 20}); err != nil {
		return nil, err
	}
	for _, list := range [][]*store.Item{o.Urgent, o.DueSoon, o.InProgress} {
		stripBodies(list)
	}
	return o, nil
}

func (s *Server) overview(w http.ResponseWriter, r *http.Request) {
	o, err := s.buildOverview()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func stripBodies(items []*store.Item) {
	for _, it := range items {
		it.Body = ""
	}
}

// ── Products ──

func (s *Server) listProducts(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Products()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) getProduct(w http.ResponseWriter, r *http.Request) {
	p, err := s.store.ProductWithCounts(r.PathValue("key"))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) createProduct(w http.ResponseWriter, r *http.Request) {
	var in store.ProductInput
	if !readJSON(w, r, &in) {
		return
	}
	p, err := s.store.CreateProduct(in)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	_ = s.store.LogProduct(p.ID, actor(r), "product", map[string][2]any{"created": {nil, p.Name}})
	s.publish(r, "products")
	writeJSON(w, http.StatusCreated, p)
}

func (s *Server) updateProduct(w http.ResponseWriter, r *http.Request) {
	var in store.ProductInput
	if !readJSON(w, r, &in) {
		return
	}
	p, changes, err := s.store.UpdateProduct(r.PathValue("key"), in)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if len(changes) > 0 {
		_ = s.store.LogProduct(p.ID, actor(r), "product", changes)
	}
	s.publish(r, "products", "items")
	writeJSON(w, http.StatusOK, p)
}

// deleteProduct needs ?confirm=<key>, so a stray request can't wipe a
// product and every item in it.
func (s *Server) deleteProduct(w http.ResponseWriter, r *http.Request) {
	p, err := s.store.Product(r.PathValue("key"))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !strings.EqualFold(r.URL.Query().Get("confirm"), p.Key) {
		writeErr(w, http.StatusBadRequest, "confirm by passing the product's key as ?confirm=")
		return
	}
	if _, err := s.store.DeleteProduct(p.Key); err != nil {
		s.fail(w, r, err)
		return
	}
	s.log.Info("product deleted", "key", p.Key)
	s.publish(r, "products", "items", "milestones")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) orderProducts(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Keys     []string          `json:"keys"`
		Groups   map[string]string `json:"groups"`
		Sections []string          `json:"sections"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if len(req.Keys) > 1000 || len(req.Groups) > 1000 || len(req.Sections) > 200 {
		writeErr(w, http.StatusBadRequest, "too many products")
		return
	}
	if err := s.store.OrderProducts(req.Keys, req.Groups, req.Sections); err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "products")
	s.listProducts(w, r)
}

func (s *Server) groups(w http.ResponseWriter, r *http.Request) {
	g, err := s.store.Groups()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, g)
}

func (s *Server) createSection(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if err := s.store.CreateSection(req.Name); err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "products")
	s.groups(w, r)
}

func (s *Server) renameSection(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if err := s.store.RenameSection(r.PathValue("name"), req.Name); err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "products")
	s.groups(w, r)
}

func (s *Server) deleteSection(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteSection(r.PathValue("name")); err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "products")
	s.groups(w, r)
}

// ── Items ──

func list(v string) []string {
	out := []string{}
	for _, p := range strings.Split(v, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func filterFrom(q url.Values) store.Filter {
	b := func(k string) bool { v := q.Get(k); return v == "1" || v == "true" }
	n := func(k string) int { v, _ := strconv.Atoi(q.Get(k)); return v }
	return store.Filter{
		Product: q.Get("product"), Section: q.Get("section"), Status: list(q.Get("status")), Type: list(q.Get("type")), Severity: list(q.Get("severity")),
		Label: q.Get("label"), Milestone: q.Get("milestone"), Query: q.Get("q"), Open: b("open"), Closed: b("closed"),
		DueFrom: q.Get("dueFrom"), DueTo: q.Get("dueTo"), Overdue: b("overdue"), Archived: b("archived"),
		Sort: q.Get("sort"), Limit: n("limit"), Offset: n("offset"),
	}
}

func (s *Server) listItems(w http.ResponseWriter, r *http.Request) {
	items, total, err := s.store.Items(filterFrom(r.URL.Query()))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": total})
}

type itemDetail struct {
	*store.Item
	Thread   []store.Comment  `json:"thread"`
	Activity []store.Activity `json:"activity"`
}

func (s *Server) itemDetail(ref string) (*itemDetail, error) {
	it, err := s.store.Item(ref)
	if err != nil {
		return nil, err
	}
	d := &itemDetail{Item: it}
	if d.Thread, err = s.store.Comments(it.ID); err != nil {
		return nil, err
	}
	if d.Activity, err = s.store.Activity(store.ActivityFilter{ItemID: it.ID, Limit: 100}); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *Server) getItem(w http.ResponseWriter, r *http.Request) {
	d, err := s.itemDetail(r.PathValue("ref"))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (s *Server) createItem(w http.ResponseWriter, r *http.Request) {
	var in store.ItemInput
	if !readJSON(w, r, &in) {
		return
	}
	it, err := s.store.CreateItem(in, actor(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "items")
	writeJSON(w, http.StatusCreated, it)
}

func (s *Server) updateItem(w http.ResponseWriter, r *http.Request) {
	var in store.ItemInput
	if !readJSON(w, r, &in) {
		return
	}
	it, err := s.store.UpdateItem(r.PathValue("ref"), in, actor(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "items")
	writeJSON(w, http.StatusOK, it)
}

func (s *Server) deleteItem(w http.ResponseWriter, r *http.Request) {
	if _, err := s.store.TrashItem(r.PathValue("ref"), actor(r)); err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "items")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) restoreItem(w http.ResponseWriter, r *http.Request) {
	it, err := s.store.RestoreItem(r.PathValue("ref"), actor(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "items")
	writeJSON(w, http.StatusOK, it)
}

func (s *Server) listComments(w http.ResponseWriter, r *http.Request) {
	it, err := s.store.Item(r.PathValue("ref"))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	c, err := s.store.Comments(it.ID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) addComment(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Body string `json:"body"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	c, _, err := s.store.AddComment(r.PathValue("ref"), req.Body, actor(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "items", "comments")
	writeJSON(w, http.StatusCreated, c)
}

func pathID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}

// ownComment checks a token edits only comments it wrote; the owner may
// edit any.
func (s *Server) ownComment(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusNotFound, "not found")
		return 0, false
	}
	c, err := s.store.Comment(id)
	if err != nil {
		s.fail(w, r, err)
		return 0, false
	}
	if authOf(r).token != nil && c.Author != actor(r) {
		writeErr(w, http.StatusForbidden, "an API token can only change its own comments")
		return 0, false
	}
	return id, true
}

func (s *Server) editComment(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Body string `json:"body"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	id, ok := s.ownComment(w, r)
	if !ok {
		return
	}
	c, err := s.store.EditComment(id, req.Body)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "comments")
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) deleteComment(w http.ResponseWriter, r *http.Request) {
	id, ok := s.ownComment(w, r)
	if !ok {
		return
	}
	if _, err := s.store.DeleteComment(id); err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "items", "comments")
	w.WriteHeader(http.StatusNoContent)
}

// ── Trash ──

func (s *Server) trash(w http.ResponseWriter, r *http.Request) {
	items, total, err := s.store.Items(store.Filter{Deleted: true, Sort: "deleted", Limit: 1000})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	stripBodies(items)
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": total})
}

func (s *Server) purgeItem(w http.ResponseWriter, r *http.Request) {
	if err := s.store.PurgeItem(r.PathValue("ref")); err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "items")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) emptyTrash(w http.ResponseWriter, r *http.Request) {
	if _, err := s.store.EmptyTrash(); err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "items")
	w.WriteHeader(http.StatusNoContent)
}

// ── Milestones ──

func (s *Server) listMilestones(w http.ResponseWriter, r *http.Request) {
	m, err := s.store.Milestones(r.URL.Query().Get("product"))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) createMilestone(w http.ResponseWriter, r *http.Request) {
	var in store.MilestoneInput
	if !readJSON(w, r, &in) {
		return
	}
	m, err := s.store.CreateMilestone(in, actor(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "milestones")
	writeJSON(w, http.StatusCreated, m)
}

func (s *Server) updateMilestone(w http.ResponseWriter, r *http.Request) {
	var in store.MilestoneInput
	if !readJSON(w, r, &in) {
		return
	}
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	m, err := s.store.UpdateMilestone(id, in)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "milestones", "items")
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) deleteMilestone(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if _, err := s.store.DeleteMilestone(id); err != nil {
		s.fail(w, r, err)
		return
	}
	s.publish(r, "milestones", "items")
	w.WriteHeader(http.StatusNoContent)
}

// ── Labels, activity, calendar, search ──

func (s *Server) labels(w http.ResponseWriter, r *http.Request) {
	l, err := s.store.Labels()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, l)
}

func (s *Server) activity(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := store.ActivityFilter{}
	f.Before, _ = strconv.ParseInt(q.Get("before"), 10, 64)
	f.Limit, _ = strconv.Atoi(q.Get("limit"))
	if k := q.Get("product"); k != "" {
		p, err := s.store.Product(k)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		f.ProductID = p.ID
	}
	f.Section = q.Get("section")
	a, err := s.store.Activity(f)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) calendar(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, err1 := time.Parse(time.DateOnly, q.Get("from"))
	to, err2 := time.Parse(time.DateOnly, q.Get("to"))
	if err1 != nil || err2 != nil || to.Before(from) || to.Sub(from) > 400*24*time.Hour {
		writeErr(w, http.StatusBadRequest, "from and to must be dates like 2026-11-01, at most a year apart")
		return
	}
	f, t, product := from.Format(time.DateOnly), to.Format(time.DateOnly), q.Get("product")
	items, err := s.store.CalendarItems(f, t, product)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	stripBodies(items)
	ms, err := s.store.CalendarMilestones(f, t, product)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "milestones": ms})
}

func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	out := map[string]any{"products": []*store.Product{}, "items": []*store.Item{}}
	if q == "" || len(q) > 200 {
		writeJSON(w, http.StatusOK, out)
		return
	}
	products, err := s.store.Products()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	matched := []*store.Product{}
	lq := strings.ToLower(q)
	for _, p := range products {
		if strings.Contains(strings.ToLower(p.Name), lq) || strings.EqualFold(p.Key, q) || strings.Contains(strings.ToLower(p.Group), lq) {
			matched = append(matched, p)
		}
	}
	items, _, err := s.store.Items(store.Filter{Query: q, Archived: true, Sort: "updated", Limit: 30})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	stripBodies(items)
	out["products"], out["items"] = matched, items
	writeJSON(w, http.StatusOK, out)
}

// ── API tokens ──

func (s *Server) listTokens(w http.ResponseWriter, r *http.Request) {
	t, err := s.store.Tokens()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) createToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		Scope    string `json:"scope"`
		Days     int    `json:"days"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	// A token outlives the session that made it, so making one needs the
	// password, as other lasting changes do.
	acct := s.loadAccount(w, r)
	if acct == nil || !s.confirmPassword(w, r, acct, req.Password) {
		return
	}
	if req.Days < 0 || req.Days > 3650 {
		writeErr(w, http.StatusBadRequest, "days must be between 0 (never expires) and 3650")
		return
	}
	token, info, err := s.store.CreateToken(req.Name, req.Scope, time.Duration(req.Days)*24*time.Hour)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.log.Info("API token created", "name", info.Name, "scope", info.Scope, "ip", s.clientIP(r))
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "info": info})
}

func (s *Server) deleteToken(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteToken(r.PathValue("id")); err != nil {
		s.fail(w, r, err)
		return
	}
	s.log.Info("API token revoked", "id", r.PathValue("id"))
	w.WriteHeader(http.StatusNoContent)
}
