package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// An Item is one piece of work on a product: a feature, a bug, a task.
type Item struct {
	ID          int64    `json:"id"`
	Ref         string   `json:"ref"` // KEY-NUMBER, e.g. PLN-12; IN-3 for the inbox
	ProductID   *int64   `json:"productId"`
	ProductKey  string   `json:"productKey"`
	ProductName string   `json:"productName"`
	Number      int64    `json:"number"`
	Type        string   `json:"type"`
	Title       string   `json:"title"`
	Body        string   `json:"body,omitempty"`
	Status      string   `json:"status"`
	Severity    string   `json:"severity"`
	Labels      []string `json:"labels"`
	StartDate   string   `json:"startDate"`
	Due         string   `json:"due"`
	MilestoneID *int64   `json:"milestoneId"`
	Milestone   string   `json:"milestone"`
	Position    float64  `json:"position"`
	CreatedBy   string   `json:"createdBy"`
	Created     int64    `json:"created"`
	Updated     int64    `json:"updated"`
	ClosedAt    int64    `json:"closedAt"`
	DeletedAt   int64    `json:"deletedAt,omitempty"`
	Comments    int      `json:"comments"`
	// Checklist counts the "- [ ]" and "- [x]" lines in the body.
	Checklist Checklist `json:"checklist"`
}

type Checklist struct {
	Done  int `json:"done"`
	Total int `json:"total"`
}

var checkRe = regexp.MustCompile(`(?m)^\s*[-*+]\s+\[([ xX])\]\s`)

func checklistOf(body string) Checklist {
	var c Checklist
	for _, m := range checkRe.FindAllStringSubmatch(body, -1) {
		c.Total++
		if m[1] != " " {
			c.Done++
		}
	}
	return c
}

// ItemInput is a create or a partial update: nil fields are left alone.
type ItemInput struct {
	// Product is a product key or id; "" (or "IN") moves the item to the inbox.
	Product   *string   `json:"product"`
	Type      *string   `json:"type"`
	Title     *string   `json:"title"`
	Body      *string   `json:"body"`
	Status    *string   `json:"status"`
	Severity  *string   `json:"severity"`
	Labels    *[]string `json:"labels"`
	StartDate *string   `json:"startDate"`
	Due       *string   `json:"due"`
	// Milestone is a milestone id or name in the item's product; "" clears it.
	Milestone *string  `json:"milestone"`
	Position  *float64 `json:"position"`
	// AddLabels and RemoveLabels change labels without replacing them.
	AddLabels    []string `json:"addLabels"`
	RemoveLabels []string `json:"removeLabels"`
	// AppendBody adds a paragraph to the end of the body.
	AppendBody *string `json:"appendBody"`
}

const itemSelect = `SELECT i.id, i.product_id, IFNULL(p.key, 'IN'), IFNULL(p.name, 'Inbox'), i.number, i.type, i.title, i.body, i.status,
	i.severity, i.labels, i.start_date, i.due, i.milestone_id, IFNULL(m.name, ''), i.position, i.created_by, i.created, i.updated,
	i.closed_at, i.deleted_at, (SELECT COUNT(*) FROM comments c WHERE c.item_id = i.id)
	FROM items i LEFT JOIN products p ON p.id = i.product_id LEFT JOIN milestones m ON m.id = i.milestone_id`

func scanItem(row interface{ Scan(...any) error }) (*Item, error) {
	var it Item
	var pid, mid sql.NullInt64
	var labels string
	err := row.Scan(&it.ID, &pid, &it.ProductKey, &it.ProductName, &it.Number, &it.Type, &it.Title, &it.Body, &it.Status,
		&it.Severity, &labels, &it.StartDate, &it.Due, &mid, &it.Milestone, &it.Position, &it.CreatedBy, &it.Created, &it.Updated,
		&it.ClosedAt, &it.DeletedAt, &it.Comments)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if pid.Valid {
		it.ProductID = &pid.Int64
	}
	if mid.Valid {
		it.MilestoneID = &mid.Int64
	}
	_ = json.Unmarshal([]byte(labels), &it.Labels)
	if it.Labels == nil {
		it.Labels = []string{}
	}
	it.Ref = fmt.Sprintf("%s-%d", it.ProductKey, it.Number)
	it.Checklist = checklistOf(it.Body)
	return &it, nil
}

var refRe = regexp.MustCompile(`^([A-Za-z][A-Za-z0-9]{1,7})-(\d+)$`)

// Item finds an item by ref (PLN-12), "#45" or id (45). Items in the trash
// are found too; callers check DeletedAt.
func (s *Store) Item(ref string) (*Item, error) {
	ref = strings.TrimPrefix(strings.TrimSpace(ref), "#")
	if id, ok := atoi(ref); ok {
		return scanItem(s.db.QueryRow(itemSelect+` WHERE i.id = ?`, id))
	}
	m := refRe.FindStringSubmatch(ref)
	if m == nil {
		return nil, ErrNotFound
	}
	n, _ := strconv.ParseInt(m[2], 10, 64)
	if strings.EqualFold(m[1], InboxKey) {
		return scanItem(s.db.QueryRow(itemSelect+` WHERE i.product_id IS NULL AND i.number = ?`, n))
	}
	return scanItem(s.db.QueryRow(itemSelect+` WHERE p.key = ? AND i.number = ?`, m[1], n))
}

// Filter narrows Items. Empty fields don't filter.
type Filter struct {
	Product   string   // key or id; "IN" for the inbox
	Section   string   // sidebar section: items of its products (ignored with Product)
	Status    []string // any of
	Type      []string
	Severity  []string
	Label     string
	Milestone string // id
	Query     string // words in the title or body
	Open      bool   // leave out done and cancelled
	Closed    bool   // only done and cancelled
	DueFrom   string // YYYY-MM-DD
	DueTo     string
	Overdue   bool
	Archived  bool // include items of archived products
	Deleted   bool // the trash instead
	Sort      string
	Limit     int
	Offset    int
}

// Items lists items matching f, and how many match in all.
func (s *Store) Items(f Filter) ([]*Item, int, error) {
	where := []string{}
	args := []any{}
	add := func(cond string, a ...any) { where = append(where, cond); args = append(args, a...) }
	if f.Deleted {
		add(`i.deleted_at > 0`)
	} else {
		add(`i.deleted_at = 0`)
	}
	if f.Product != "" {
		if strings.EqualFold(f.Product, InboxKey) {
			add(`i.product_id IS NULL`)
		} else {
			p, err := s.Product(f.Product)
			if err != nil {
				return nil, 0, err
			}
			add(`i.product_id = ?`, p.ID)
		}
	} else {
		if f.Section != "" {
			add(`p.grp = ? COLLATE NOCASE`, f.Section)
		}
		if !f.Archived && !f.Deleted {
			add(`IFNULL(p.status, '') <> 'archived'`)
		}
	}
	in := func(col string, vals []string) {
		if len(vals) == 0 {
			return
		}
		ph := strings.TrimSuffix(strings.Repeat("?,", len(vals)), ",")
		a := make([]any, len(vals))
		for i, v := range vals {
			a[i] = v
		}
		add(col+` IN (`+ph+`)`, a...)
	}
	in("i.status", f.Status)
	in("i.type", f.Type)
	in("i.severity", f.Severity)
	if f.Label != "" {
		add(`EXISTS (SELECT 1 FROM json_each(i.labels) WHERE value = ?)`, strings.ToLower(f.Label))
	}
	if f.Milestone != "" {
		if f.Milestone == "none" {
			add(`i.milestone_id IS NULL`)
		} else {
			add(`i.milestone_id = ?`, f.Milestone)
		}
	}
	if f.Open {
		add(`i.status NOT IN ('done', 'cancelled')`)
	}
	if f.Closed {
		add(`i.status IN ('done', 'cancelled')`)
	}
	if f.DueFrom != "" {
		add(`i.due >= ?`, f.DueFrom)
	}
	if f.DueTo != "" {
		add(`i.due <> '' AND i.due <= ?`, f.DueTo)
	}
	if f.Overdue {
		add(`i.due <> '' AND i.due < ? AND i.status NOT IN ('done', 'cancelled')`, Today())
	}
	for _, w := range strings.Fields(f.Query) {
		if len(where) > 40 {
			break
		}
		if m := refRe.FindStringSubmatch(w); m != nil {
			add(`(IFNULL(p.key, 'IN') = ? COLLATE NOCASE AND i.number = ?)`, m[1], m[2])
			continue
		}
		like := "%" + escapeLike(w) + "%"
		add(`(i.title LIKE ? ESCAPE '\' OR i.body LIKE ? ESCAPE '\' OR i.labels LIKE ? ESCAPE '\')`, like, like, like)
	}
	cond := strings.Join(where, " AND ")
	var total int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM items i LEFT JOIN products p ON p.id = i.product_id WHERE `+cond, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	order := `i.position, i.id`
	switch f.Sort {
	case "updated":
		order = `i.updated DESC, i.id DESC`
	case "created":
		order = `i.created DESC, i.id DESC`
	case "due":
		order = `i.due = '', i.due, i.id`
	case "severity":
		order = `CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.updated DESC`
	case "deleted":
		order = `i.deleted_at DESC`
	}
	limit := f.Limit
	if limit <= 0 || limit > 1000 {
		limit = 1000
	}
	rows, err := s.db.Query(itemSelect+` WHERE `+cond+` ORDER BY `+order+` LIMIT ? OFFSET ?`, append(args, limit, max(f.Offset, 0))...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []*Item{}
	for rows.Next() {
		it, err := scanItem(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, it)
	}
	return out, total, rows.Err()
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// resolveProduct turns a product reference into an id; nil is the inbox.
func (s *Store) resolveProduct(ref string) (*int64, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" || strings.EqualFold(ref, InboxKey) {
		return nil, nil
	}
	p, err := s.Product(ref)
	if errors.Is(err, ErrNotFound) {
		return nil, invalid("there's no product %q", ref)
	}
	if err != nil {
		return nil, err
	}
	return &p.ID, nil
}

func (s *Store) resolveMilestone(productID *int64, ref string) (*int64, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil, nil
	}
	if productID == nil {
		return nil, invalid("inbox items can't have a milestone; give the item a product first")
	}
	var id int64
	var err error
	if n, ok := atoi(ref); ok {
		err = s.db.QueryRow(`SELECT id FROM milestones WHERE id = ? AND product_id = ?`, n, *productID).Scan(&id)
	} else {
		err = s.db.QueryRow(`SELECT id FROM milestones WHERE name = ? COLLATE NOCASE AND product_id = ?`, ref, *productID).Scan(&id)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil, invalid("the item's product has no milestone %q", ref)
	}
	return &id, err
}

// CreateItem adds an item. actor names who did it, for the activity log.
func (s *Store) CreateItem(in ItemInput, actor string) (*Item, error) {
	it := &Item{Type: "task", Status: "backlog", Severity: "medium", Labels: []string{}}
	if in.Title == nil || strings.TrimSpace(*in.Title) == "" {
		return nil, invalid("an item needs a title")
	}
	var product string
	if in.Product != nil {
		product = *in.Product
	}
	pid, err := s.resolveProduct(product)
	if err != nil {
		return nil, err
	}
	it.ProductID = pid
	if err := s.applyItem(it, &in); err != nil {
		return nil, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	number, err := takeNumber(tx, pid)
	if err != nil {
		return nil, err
	}
	pos := it.Position
	if in.Position == nil {
		if err := tx.QueryRow(`SELECT IFNULL(MAX(position), 0) + 1 FROM items WHERE status = ?`, it.Status).Scan(&pos); err != nil {
			return nil, err
		}
	}
	labels, _ := json.Marshal(it.Labels)
	t := now()
	closed := int64(0)
	if Closed(it.Status) {
		closed = t
	}
	res, err := tx.Exec(`INSERT INTO items (product_id, number, type, title, body, status, severity, labels, start_date, due, milestone_id, position, created_by, created, updated, closed_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		pid, number, it.Type, it.Title, it.Body, it.Status, it.Severity, string(labels), it.StartDate, it.Due, it.MilestoneID, pos, actor, t, t, closed)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	if err := logActivity(tx, &id, pid, actor, "created", nil); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return scanItem(s.db.QueryRow(itemSelect+` WHERE i.id = ?`, id))
}

func takeNumber(tx *sql.Tx, pid *int64) (int64, error) {
	var n int64
	var err error
	if pid == nil {
		err = tx.QueryRow(`UPDATE inbox SET next_number = next_number + 1 WHERE id = 1 RETURNING next_number - 1`).Scan(&n)
	} else {
		err = tx.QueryRow(`UPDATE products SET next_number = next_number + 1 WHERE id = ? RETURNING next_number - 1`, *pid).Scan(&n)
	}
	return n, err
}

// applyItem validates in and copies it onto it. Product changes are
// handled by the caller (they need a new number).
func (s *Store) applyItem(it *Item, in *ItemInput) error {
	var err error
	if in.Title != nil {
		if it.Title, err = cleanLine(*in.Title, maxTitle, "title"); err != nil {
			return err
		}
		if it.Title == "" {
			return invalid("an item needs a title")
		}
	}
	if in.Type != nil {
		if err := oneOf("type", *in.Type, ItemTypes); err != nil {
			return err
		}
		it.Type = *in.Type
	}
	if in.Status != nil {
		st := strings.ReplaceAll(strings.ToLower(*in.Status), " ", "_")
		if st == "in-progress" {
			st = "in_progress"
		}
		if err := oneOf("status", st, ItemStatuses); err != nil {
			return err
		}
		it.Status = st
	}
	if in.Severity != nil {
		if err := oneOf("severity", strings.ToLower(*in.Severity), Severities); err != nil {
			return err
		}
		it.Severity = strings.ToLower(*in.Severity)
	}
	if in.Body != nil {
		if it.Body, err = cleanText(*in.Body, maxBody, "body"); err != nil {
			return err
		}
	}
	if in.AppendBody != nil && strings.TrimSpace(*in.AppendBody) != "" {
		body := strings.TrimRight(it.Body, "\n")
		if body != "" {
			body += "\n\n"
		}
		if it.Body, err = cleanText(body+*in.AppendBody, maxBody, "body"); err != nil {
			return err
		}
	}
	if in.Labels != nil {
		if it.Labels, err = cleanLabels(*in.Labels); err != nil {
			return err
		}
	}
	if len(in.AddLabels) > 0 || len(in.RemoveLabels) > 0 {
		remove, _ := cleanLabels(in.RemoveLabels)
		next := slices.DeleteFunc(slices.Clone(it.Labels), func(l string) bool { return slices.Contains(remove, l) })
		if it.Labels, err = cleanLabels(append(next, in.AddLabels...)); err != nil {
			return err
		}
	}
	if in.StartDate != nil {
		if it.StartDate, err = cleanDate(*in.StartDate, "startDate"); err != nil {
			return err
		}
	}
	if in.Due != nil {
		if it.Due, err = cleanDate(*in.Due, "due"); err != nil {
			return err
		}
	}
	if it.StartDate != "" && it.Due != "" && it.StartDate > it.Due {
		return invalid("the start date is after the due date")
	}
	if in.Milestone != nil {
		if it.MilestoneID, err = s.resolveMilestone(it.ProductID, *in.Milestone); err != nil {
			return err
		}
	}
	if in.Position != nil {
		it.Position = *in.Position
	}
	return nil
}

// UpdateItem changes an item and logs what changed.
func (s *Store) UpdateItem(ref string, in ItemInput, actor string) (*Item, error) {
	it, err := s.Item(ref)
	if err != nil {
		return nil, err
	}
	if it.DeletedAt > 0 {
		return nil, invalid("%s is in the trash; restore it first", it.Ref)
	}
	before := *it
	before.Labels = slices.Clone(it.Labels)
	moved := false
	if in.Product != nil {
		pid, err := s.resolveProduct(*in.Product)
		if err != nil {
			return nil, err
		}
		if !sameID(pid, it.ProductID) {
			moved = true
			it.ProductID = pid
			// Milestones belong to a product: keep only one named the same.
			if in.Milestone == nil {
				if it.Milestone != "" && pid != nil {
					if id, err := s.resolveMilestone(pid, it.Milestone); err == nil {
						it.MilestoneID = id
					} else {
						it.MilestoneID = nil
					}
				} else {
					it.MilestoneID = nil
				}
			}
		}
	}
	if err := s.applyItem(it, &in); err != nil {
		return nil, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	number := it.Number
	if moved {
		if number, err = takeNumber(tx, it.ProductID); err != nil {
			return nil, err
		}
	}
	if in.Status != nil && it.Status != before.Status && in.Position == nil {
		// Moved to another column without a place: it goes to the bottom.
		if err := tx.QueryRow(`SELECT IFNULL(MAX(position), 0) + 1 FROM items WHERE status = ?`, it.Status).Scan(&it.Position); err != nil {
			return nil, err
		}
	}
	closed := it.ClosedAt
	if Closed(it.Status) && !Closed(before.Status) {
		closed = now()
	} else if !Closed(it.Status) {
		closed = 0
	}
	labels, _ := json.Marshal(it.Labels)
	_, err = tx.Exec(`UPDATE items SET product_id=?, number=?, type=?, title=?, body=?, status=?, severity=?, labels=?, start_date=?, due=?,
		milestone_id=?, position=?, updated=?, closed_at=? WHERE id=?`,
		it.ProductID, number, it.Type, it.Title, it.Body, it.Status, it.Severity, string(labels), it.StartDate, it.Due,
		it.MilestoneID, it.Position, now(), closed, it.ID)
	if err != nil {
		return nil, err
	}
	changes := map[string][2]any{}
	diff := func(field string, a, b any) {
		if a != b {
			changes[field] = [2]any{a, b}
		}
	}
	diff("title", before.Title, it.Title)
	diff("type", before.Type, it.Type)
	diff("status", before.Status, it.Status)
	diff("severity", before.Severity, it.Severity)
	diff("startDate", before.StartDate, it.StartDate)
	diff("due", before.Due, it.Due)
	if !slices.Equal(before.Labels, it.Labels) {
		changes["labels"] = [2]any{before.Labels, it.Labels}
	}
	if !sameID(before.MilestoneID, it.MilestoneID) {
		var name string
		if it.MilestoneID != nil {
			_ = tx.QueryRow(`SELECT name FROM milestones WHERE id = ?`, *it.MilestoneID).Scan(&name)
		}
		changes["milestone"] = [2]any{before.Milestone, name}
	}
	if before.Body != it.Body {
		changes["body"] = [2]any{nil, nil}
	}
	if moved {
		var key string = InboxKey
		if it.ProductID != nil {
			_ = tx.QueryRow(`SELECT key FROM products WHERE id = ?`, *it.ProductID).Scan(&key)
		}
		changes["ref"] = [2]any{before.Ref, fmt.Sprintf("%s-%d", key, number)}
	}
	if len(changes) > 0 {
		if err := logActivity(tx, &it.ID, it.ProductID, actor, "updated", changes); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return scanItem(s.db.QueryRow(itemSelect+` WHERE i.id = ?`, it.ID))
}

func sameID(a, b *int64) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// TrashItem moves an item to the trash; RestoreItem brings it back.
func (s *Store) TrashItem(ref, actor string) (*Item, error) {
	return s.setDeleted(ref, actor, true)
}

func (s *Store) RestoreItem(ref, actor string) (*Item, error) {
	return s.setDeleted(ref, actor, false)
}

func (s *Store) setDeleted(ref, actor string, del bool) (*Item, error) {
	it, err := s.Item(ref)
	if err != nil {
		return nil, err
	}
	at, action := int64(0), "restored"
	if del {
		at, action = now(), "deleted"
	}
	if (it.DeletedAt > 0) == del {
		return it, nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE items SET deleted_at = ? WHERE id = ?`, at, it.ID); err != nil {
		return nil, err
	}
	if err := logActivity(tx, &it.ID, it.ProductID, actor, action, nil); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	it.DeletedAt = at
	return it, nil
}

// PurgeItem deletes a trashed item for good.
func (s *Store) PurgeItem(ref string) error {
	it, err := s.Item(ref)
	if err != nil {
		return err
	}
	if it.DeletedAt == 0 {
		return invalid("only items in the trash can be deleted for good")
	}
	_, err = s.db.Exec(`DELETE FROM items WHERE id = ?`, it.ID)
	return err
}

func (s *Store) EmptyTrash() (int, error) {
	res, err := s.db.Exec(`DELETE FROM items WHERE deleted_at > 0`)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// Label is a label and how many open items carry it.
type Label struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
	Open  int    `json:"open"`
}

func (s *Store) Labels() ([]Label, error) {
	rows, err := s.db.Query(`SELECT j.value, COUNT(*), SUM(i.status NOT IN ('done', 'cancelled')) FROM items i, json_each(i.labels) j
		WHERE i.deleted_at = 0 GROUP BY j.value ORDER BY COUNT(*) DESC, j.value`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Label{}
	for rows.Next() {
		var l Label
		if err := rows.Scan(&l.Name, &l.Count, &l.Open); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// Today is the server's local date, YYYY-MM-DD.
func Today() string { return time.Now().Format(time.DateOnly) }

func atoi(s string) (int64, bool) {
	n, err := strconv.ParseInt(s, 10, 64)
	return n, err == nil && n > 0
}

func itoa(n int) string { return strconv.Itoa(n) }
