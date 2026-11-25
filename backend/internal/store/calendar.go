package store

import (
	"strings"
	"time"
)

// CalendarItems lists items whose start..due span touches from..to
// (inclusive, YYYY-MM-DD), leaving out archived products' items unless one
// product is asked for.
func (s *Store) CalendarItems(from, to, product string) ([]*Item, error) {
	q := itemSelect + ` WHERE i.deleted_at = 0 AND i.due <> '' AND i.due >= ? AND IFNULL(NULLIF(i.start_date, ''), i.due) <= ?`
	args := []any{from, to}
	if strings.EqualFold(product, InboxKey) {
		q += ` AND i.product_id IS NULL`
	} else if product != "" {
		p, err := s.Product(product)
		if err != nil {
			return nil, err
		}
		q += ` AND i.product_id = ?`
		args = append(args, p.ID)
	} else {
		q += ` AND IFNULL(p.status, '') <> 'archived'`
	}
	rows, err := s.db.Query(q+` ORDER BY i.due, i.id LIMIT 2000`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Item{}
	for rows.Next() {
		it, err := scanItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// CalendarMilestones lists milestones due from..to.
func (s *Store) CalendarMilestones(from, to, product string) ([]*Milestone, error) {
	all, err := s.Milestones(product)
	if err != nil {
		return nil, err
	}
	out := []*Milestone{}
	for _, m := range all {
		if m.Due != "" && m.Due >= from && m.Due <= to {
			out = append(out, m)
		}
	}
	return out, nil
}

// Totals are the home screen's headline numbers.
type Totals struct {
	Open         int `json:"open"`
	InProgress   int `json:"inProgress"`
	Critical     int `json:"critical"`
	High         int `json:"high"`
	Overdue      int `json:"overdue"`
	DueThisWeek  int `json:"dueThisWeek"`
	Inbox        int `json:"inbox"`
	DoneThisWeek int `json:"doneThisWeek"`
}

func (s *Store) Totals() (Totals, error) {
	var t Totals
	today := time.Now()
	week := today.AddDate(0, 0, 7).Format(time.DateOnly)
	err := s.db.QueryRow(`SELECT
		COUNT(*) FILTER (WHERE open),
		COUNT(*) FILTER (WHERE status IN ('in_progress', 'review')),
		COUNT(*) FILTER (WHERE open AND severity = 'critical'),
		COUNT(*) FILTER (WHERE open AND severity = 'high'),
		COUNT(*) FILTER (WHERE open AND due <> '' AND due < ?),
		COUNT(*) FILTER (WHERE open AND due <> '' AND due >= ? AND due <= ?),
		COUNT(*) FILTER (WHERE open AND product_id IS NULL),
		COUNT(*) FILTER (WHERE status = 'done' AND closed_at >= ?)
		FROM (SELECT i.*, i.status NOT IN ('done', 'cancelled') AS open FROM items i LEFT JOIN products p ON p.id = i.product_id
			WHERE i.deleted_at = 0 AND IFNULL(p.status, '') <> 'archived')`,
		Today(), Today(), week, today.AddDate(0, 0, -7).Unix()).
		Scan(&t.Open, &t.InProgress, &t.Critical, &t.High, &t.Overdue, &t.DueThisWeek, &t.Inbox, &t.DoneThisWeek)
	return t, err
}
