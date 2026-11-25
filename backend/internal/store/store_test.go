package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func open(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "docket.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func ptr[T any](v T) *T { return &v }

func TestProductsAndItems(t *testing.T) {
	s := open(t)
	p, err := s.CreateProduct(ProductInput{Name: ptr("Plinthio Media"), Group: ptr("Apps")})
	if err != nil {
		t.Fatal(err)
	}
	if p.Key != "PM" || p.Status != "active" {
		t.Fatalf("key %q status %q", p.Key, p.Status)
	}
	if _, err := s.CreateProduct(ProductInput{Name: ptr("Other"), Key: ptr("pm")}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("duplicate key: %v", err)
	}
	if _, err := s.CreateProduct(ProductInput{Name: ptr("X"), Key: ptr("IN")}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("reserved key: %v", err)
	}

	a, err := s.CreateItem(ItemInput{Product: ptr("PM"), Title: ptr("  Crash on   start "), Type: ptr("bug"), Severity: ptr("critical"), Labels: &[]string{"Crash", "crash", "#iOS"}}, "Claude")
	if err != nil {
		t.Fatal(err)
	}
	if a.Ref != "PM-1" || a.Title != "Crash on start" || len(a.Labels) != 2 || a.Labels[1] != "ios" || a.CreatedBy != "Claude" {
		t.Fatalf("%+v", a)
	}
	b, err := s.CreateItem(ItemInput{Title: ptr("Idea for later")}, "You")
	if err != nil {
		t.Fatal(err)
	}
	if b.Ref != "IN-1" || b.ProductID != nil {
		t.Fatalf("inbox ref %q", b.Ref)
	}
	if _, err := s.CreateItem(ItemInput{Title: ptr("x"), Severity: ptr("urgent")}, "You"); !errors.Is(err, ErrInvalid) {
		t.Fatal("bad severity accepted")
	}
	if _, err := s.CreateItem(ItemInput{Title: ptr("x"), Due: ptr("tomorrow")}, "You"); !errors.Is(err, ErrInvalid) {
		t.Fatal("bad date accepted")
	}

	// Move the inbox item into the product: it gets a new number.
	moved, err := s.UpdateItem("IN-1", ItemInput{Product: ptr("pm"), Status: ptr("in progress"), Body: ptr("- [x] one\n- [ ] two")}, "You")
	if err != nil {
		t.Fatal(err)
	}
	if moved.Ref != "PM-2" || moved.Status != "in_progress" || moved.Checklist != (Checklist{1, 2}) {
		t.Fatalf("%+v", moved)
	}
	got, err := s.Item("pm-2")
	if err != nil || got.ID != b.ID {
		t.Fatalf("lookup by ref: %v", err)
	}

	done, err := s.UpdateItem("PM-1", ItemInput{Status: ptr("done"), AddLabels: []string{"fixed"}, RemoveLabels: []string{"crash"}, AppendBody: ptr("Fixed in 1.2")}, "Claude")
	if err != nil {
		t.Fatal(err)
	}
	if done.ClosedAt == 0 || done.Body != "Fixed in 1.2" || len(done.Labels) != 2 || done.Labels[0] != "ios" {
		t.Fatalf("%+v", done)
	}

	open, total, err := s.Items(Filter{Product: "PM", Open: true})
	if err != nil || total != 1 || open[0].Ref != "PM-2" {
		t.Fatalf("open items: %v %d", err, total)
	}
	found, _, _ := s.Items(Filter{Query: "start"})
	if len(found) != 1 || found[0].Ref != "PM-1" {
		t.Fatalf("search: %+v", found)
	}
	byLabel, _, _ := s.Items(Filter{Label: "IOS"})
	if len(byLabel) != 1 {
		t.Fatalf("label filter: %d", len(byLabel))
	}
	// A LIKE wildcard in a query is literal.
	if wild, _, _ := s.Items(Filter{Query: "%"}); len(wild) != 0 {
		t.Fatalf("wildcard matched %d", len(wild))
	}

	act, err := s.Activity(ActivityFilter{ItemID: a.ID})
	if err != nil || len(act) != 2 || act[0].Actor != "Claude" || act[0].Action != "updated" {
		t.Fatalf("activity %+v %v", act, err)
	}

	// Archived products drop out of the default lists.
	if _, _, err := s.UpdateProduct("PM", ProductInput{Status: ptr("archived")}); err != nil {
		t.Fatal(err)
	}
	if all, _, _ := s.Items(Filter{}); len(all) != 0 {
		t.Fatalf("archived items listed: %d", len(all))
	}
	if all, _, _ := s.Items(Filter{Archived: true}); len(all) != 2 {
		t.Fatalf("with archived: %d", len(all))
	}

	// Trash and restore.
	if _, err := s.TrashItem("PM-2", "You"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateItem("PM-2", ItemInput{Title: ptr("x")}, "You"); !errors.Is(err, ErrInvalid) {
		t.Fatal("edited a trashed item")
	}
	if trash, _, _ := s.Items(Filter{Deleted: true}); len(trash) != 1 {
		t.Fatal("trash")
	}
	if _, err := s.RestoreItem("PM-2", "You"); err != nil {
		t.Fatal(err)
	}
}

func TestMilestones(t *testing.T) {
	s := open(t)
	if _, err := s.CreateProduct(ProductInput{Name: ptr("Coffer"), Key: ptr("COF")}); err != nil {
		t.Fatal(err)
	}
	m, err := s.CreateMilestone(MilestoneInput{Product: ptr("COF"), Name: ptr("v0.4"), Due: ptr("2026-12-01")}, "You")
	if err != nil {
		t.Fatal(err)
	}
	it, err := s.CreateItem(ItemInput{Product: ptr("COF"), Title: ptr("Ship"), Milestone: ptr("V0.4")}, "You")
	if err != nil || it.MilestoneID == nil || *it.MilestoneID != m.ID || it.Milestone != "v0.4" {
		t.Fatalf("%+v %v", it, err)
	}
	if _, err := s.CreateItem(ItemInput{Title: ptr("Inbox"), Milestone: ptr("v0.4")}, "You"); !errors.Is(err, ErrInvalid) {
		t.Fatal("inbox item got a milestone")
	}
	got, _ := s.Milestone(m.ID)
	if got.Open != 1 {
		t.Fatalf("open %d", got.Open)
	}
	if _, err := s.DeleteMilestone(m.ID); err != nil {
		t.Fatal(err)
	}
	after, _ := s.Item(it.Ref)
	if after.MilestoneID != nil {
		t.Fatal("milestone not cleared")
	}
}

func TestTokens(t *testing.T) {
	s := open(t)
	tok, info, err := s.CreateToken("Claude", "write", 0)
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.CheckToken(tok)
	if err != nil || got == nil || got.ID != info.ID || got.Scope != "write" {
		t.Fatalf("%+v %v", got, err)
	}
	if bad, _ := s.CheckToken(tok + "x"); bad != nil {
		t.Fatal("wrong token accepted")
	}
	if bad, _ := s.CheckToken("not-a-token"); bad != nil {
		t.Fatal("non-token accepted")
	}
	if err := s.DeleteToken(info.ID); err != nil {
		t.Fatal(err)
	}
	if gone, _ := s.CheckToken(tok); gone != nil {
		t.Fatal("revoked token accepted")
	}
	if _, _, err := s.CreateToken("x", "admin", 0); !errors.Is(err, ErrInvalid) {
		t.Fatal("bad scope accepted")
	}
}

func TestDeleteProductCascades(t *testing.T) {
	s := open(t)
	p, _ := s.CreateProduct(ProductInput{Name: ptr("Gone"), Key: ptr("GON")})
	it, _ := s.CreateItem(ItemInput{Product: ptr("GON"), Title: ptr("x")}, "You")
	if _, _, err := s.AddComment(it.Ref, "hi", "You"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DeleteProduct("GON"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Item(itoa(int(it.ID))); !errors.Is(err, ErrNotFound) {
		t.Fatalf("item survived: %v", err)
	}
	var n int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE product_id = ?`, p.ID).Scan(&n)
	if n != 0 {
		t.Fatalf("activity left: %d", n)
	}
}

func TestSections(t *testing.T) {
	s := open(t)
	_, _ = s.CreateProduct(ProductInput{Name: ptr("A"), Key: ptr("AA"), Group: ptr("Games")})
	_, _ = s.CreateProduct(ProductInput{Name: ptr("B"), Key: ptr("BB")})
	if err := s.CreateSection("Tools"); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateSection("tools"); !errors.Is(err, ErrInvalid) {
		t.Fatal("duplicate section")
	}
	g, _ := s.Groups()
	if len(g) != 2 || g[0] != "Games" || g[1] != "Tools" {
		t.Fatalf("%v", g)
	}
	// Move B into the empty Tools section and put Tools first.
	if err := s.OrderProducts([]string{"BB", "AA"}, map[string]string{"BB": "Tools"}, []string{"Tools", "Games"}); err != nil {
		t.Fatal(err)
	}
	g, _ = s.Groups()
	b, _ := s.Product("BB")
	if g[0] != "Tools" || b.Group != "Tools" {
		t.Fatalf("%v %q", g, b.Group)
	}
	if err := s.RenameSection("tools", "Utilities"); err != nil {
		t.Fatal(err)
	}
	if b, _ = s.Product("BB"); b.Group != "Utilities" {
		t.Fatalf("rename: %q", b.Group)
	}
	if err := s.DeleteSection("Utilities"); err != nil {
		t.Fatal(err)
	}
	if b, _ = s.Product("BB"); b.Group != "" {
		t.Fatal("product kept a deleted section")
	}
	if g, _ = s.Groups(); len(g) != 1 {
		t.Fatalf("%v", g)
	}
	// Items of one section only.
	_, _ = s.CreateItem(ItemInput{Product: ptr("AA"), Title: ptr("in games")}, "You")
	_, _ = s.CreateItem(ItemInput{Product: ptr("BB"), Title: ptr("ungrouped")}, "You")
	if got, n, err := s.Items(Filter{Section: "games"}); err != nil || n != 1 || got[0].Title != "in games" {
		t.Fatalf("section filter: %v %d", err, n)
	}
	if a, _ := s.Activity(ActivityFilter{Section: "Games"}); len(a) != 1 {
		t.Fatalf("section activity: %d", len(a))
	}
}
