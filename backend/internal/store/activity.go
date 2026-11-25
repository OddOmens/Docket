package store

import (
	"database/sql"
	"encoding/json"
	"errors"
)

// ── Comments ──

type Comment struct {
	ID      int64  `json:"id"`
	ItemID  int64  `json:"itemId"`
	Author  string `json:"author"`
	Body    string `json:"body"`
	Created int64  `json:"created"`
	Updated int64  `json:"updated"`
}

func (s *Store) Comments(itemID int64) ([]Comment, error) {
	rows, err := s.db.Query(`SELECT id, item_id, author, body, created, updated FROM comments WHERE item_id = ? ORDER BY created, id`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Comment{}
	for rows.Next() {
		var c Comment
		if err := rows.Scan(&c.ID, &c.ItemID, &c.Author, &c.Body, &c.Created, &c.Updated); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) AddComment(ref, body, actor string) (*Comment, *Item, error) {
	it, err := s.Item(ref)
	if err != nil {
		return nil, nil, err
	}
	if it.DeletedAt > 0 {
		return nil, nil, invalid("%s is in the trash", it.Ref)
	}
	body, err = cleanText(body, maxComment, "comment")
	if err != nil {
		return nil, nil, err
	}
	if body == "" {
		return nil, nil, invalid("the comment is empty")
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()
	t := now()
	res, err := tx.Exec(`INSERT INTO comments (item_id, author, body, created, updated) VALUES (?,?,?,?,?)`, it.ID, actor, body, t, t)
	if err != nil {
		return nil, nil, err
	}
	if _, err := tx.Exec(`UPDATE items SET updated = ? WHERE id = ?`, t, it.ID); err != nil {
		return nil, nil, err
	}
	if err := logActivity(tx, &it.ID, it.ProductID, actor, "commented", nil); err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}
	id, _ := res.LastInsertId()
	return &Comment{ID: id, ItemID: it.ID, Author: actor, Body: body, Created: t, Updated: t}, it, nil
}

func (s *Store) Comment(id int64) (*Comment, error) {
	var c Comment
	err := s.db.QueryRow(`SELECT id, item_id, author, body, created, updated FROM comments WHERE id = ?`, id).
		Scan(&c.ID, &c.ItemID, &c.Author, &c.Body, &c.Created, &c.Updated)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &c, err
}

func (s *Store) EditComment(id int64, body string) (*Comment, error) {
	body, err := cleanText(body, maxComment, "comment")
	if err != nil {
		return nil, err
	}
	if body == "" {
		return nil, invalid("the comment is empty")
	}
	res, err := s.db.Exec(`UPDATE comments SET body = ?, updated = ? WHERE id = ?`, body, now(), id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return s.Comment(id)
}

func (s *Store) DeleteComment(id int64) (*Comment, error) {
	c, err := s.Comment(id)
	if err != nil {
		return nil, err
	}
	_, err = s.db.Exec(`DELETE FROM comments WHERE id = ?`, id)
	return c, err
}

// ── Activity ──

type Activity struct {
	ID          int64           `json:"id"`
	ItemID      *int64          `json:"itemId"`
	ItemRef     string          `json:"itemRef,omitempty"`
	ItemTitle   string          `json:"itemTitle,omitempty"`
	ProductKey  string          `json:"productKey,omitempty"`
	ProductName string          `json:"productName,omitempty"`
	Actor       string          `json:"actor"`
	Action      string          `json:"action"`
	Detail      json.RawMessage `json:"detail"`
	Created     int64           `json:"created"`
}

type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

func logActivity(db execer, itemID, productID *int64, actor, action string, detail map[string][2]any) error {
	d := []byte("{}")
	if len(detail) > 0 {
		d, _ = json.Marshal(detail)
	}
	_, err := db.Exec(`INSERT INTO activity (item_id, product_id, actor, action, detail, created) VALUES (?,?,?,?,?,?)`,
		itemID, productID, actor, action, string(d), now())
	return err
}

// LogProduct records a change to a product itself.
func (s *Store) LogProduct(productID int64, actor, action string, detail map[string][2]any) error {
	return logActivity(s.db, nil, &productID, actor, action, detail)
}

// ActivityFilter narrows Activity: one item, one product, or everything.
type ActivityFilter struct {
	ItemID    int64
	ProductID int64
	Section   string // sidebar section, when ProductID is 0
	Before    int64 // activity id, for paging
	Limit     int
}

func (s *Store) Activity(f ActivityFilter) ([]Activity, error) {
	q := `SELECT a.id, a.item_id, IFNULL(IFNULL(p.key, CASE WHEN i.id IS NOT NULL THEN 'IN' END) || '-' || i.number, ''), IFNULL(i.title, ''),
		IFNULL(p.key, ''), IFNULL(p.name, ''), a.actor, a.action, a.detail, a.created
		FROM activity a LEFT JOIN items i ON i.id = a.item_id LEFT JOIN products p ON p.id = IFNULL(i.product_id, a.product_id)
		WHERE IFNULL(i.deleted_at, 0) = 0`
	args := []any{}
	if f.ItemID > 0 {
		q = `SELECT a.id, a.item_id, '', '', '', '', a.actor, a.action, a.detail, a.created FROM activity a WHERE a.item_id = ?`
		args = append(args, f.ItemID)
	} else if f.ProductID > 0 {
		q += ` AND (a.product_id = ? OR i.product_id = ?)`
		args = append(args, f.ProductID, f.ProductID)
	} else if f.Section != "" {
		q += ` AND p.grp = ? COLLATE NOCASE`
		args = append(args, f.Section)
	}
	if f.Before > 0 {
		q += ` AND a.id < ?`
		args = append(args, f.Before)
	}
	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q += ` ORDER BY a.id DESC LIMIT ?`
	args = append(args, limit)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Activity{}
	for rows.Next() {
		var a Activity
		var iid sql.NullInt64
		var detail string
		if err := rows.Scan(&a.ID, &iid, &a.ItemRef, &a.ItemTitle, &a.ProductKey, &a.ProductName, &a.Actor, &a.Action, &detail, &a.Created); err != nil {
			return nil, err
		}
		if iid.Valid {
			a.ItemID = &iid.Int64
		}
		a.Detail = json.RawMessage(detail)
		out = append(out, a)
	}
	return out, rows.Err()
}
