package store

import (
	"database/sql"
	"errors"
	"strings"
)

// A Milestone is a release or goal on one product, with an optional date.
type Milestone struct {
	ID          int64  `json:"id"`
	ProductID   int64  `json:"productId"`
	ProductKey  string `json:"productKey"`
	ProductName string `json:"productName"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Due         string `json:"due"`
	Status      string `json:"status"`
	Created     int64  `json:"created"`
	Updated     int64  `json:"updated"`
	Open        int    `json:"open"`
	Closed      int    `json:"closed"`
}

type MilestoneInput struct {
	Product     *string `json:"product"`
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Due         *string `json:"due"`
	Status      *string `json:"status"`
}

const milestoneSelect = `SELECT m.id, m.product_id, p.key, p.name, m.name, m.description, m.due, m.status, m.created, m.updated,
	(SELECT COUNT(*) FROM items i WHERE i.milestone_id = m.id AND i.deleted_at = 0 AND i.status NOT IN ('done', 'cancelled')),
	(SELECT COUNT(*) FROM items i WHERE i.milestone_id = m.id AND i.deleted_at = 0 AND i.status IN ('done', 'cancelled'))
	FROM milestones m JOIN products p ON p.id = m.product_id`

func scanMilestone(row interface{ Scan(...any) error }) (*Milestone, error) {
	var m Milestone
	err := row.Scan(&m.ID, &m.ProductID, &m.ProductKey, &m.ProductName, &m.Name, &m.Description, &m.Due, &m.Status, &m.Created, &m.Updated, &m.Open, &m.Closed)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &m, err
}

func (in *MilestoneInput) apply(m *Milestone) error {
	var err error
	if in.Name != nil {
		if m.Name, err = cleanLine(*in.Name, maxName, "name"); err != nil {
			return err
		}
	}
	if m.Name == "" {
		return invalid("a milestone needs a name")
	}
	if in.Description != nil {
		if m.Description, err = cleanText(*in.Description, maxDesc, "description"); err != nil {
			return err
		}
	}
	if in.Due != nil {
		if m.Due, err = cleanDate(*in.Due, "due"); err != nil {
			return err
		}
	}
	if in.Status != nil {
		if err := oneOf("status", *in.Status, MilestoneStates); err != nil {
			return err
		}
		m.Status = *in.Status
	}
	return nil
}

// Milestones lists a product's milestones ("" for every product's), open
// ones first by date.
func (s *Store) Milestones(product string) ([]*Milestone, error) {
	q := milestoneSelect
	args := []any{}
	if strings.EqualFold(product, InboxKey) {
		return []*Milestone{}, nil
	}
	if product != "" {
		p, err := s.Product(product)
		if err != nil {
			return nil, err
		}
		q += ` WHERE m.product_id = ?`
		args = append(args, p.ID)
	}
	rows, err := s.db.Query(q+` ORDER BY m.status = 'done', m.due = '', m.due, m.id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Milestone{}
	for rows.Next() {
		m, err := scanMilestone(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) Milestone(id int64) (*Milestone, error) {
	return scanMilestone(s.db.QueryRow(milestoneSelect+` WHERE m.id = ?`, id))
}

func (s *Store) CreateMilestone(in MilestoneInput, actor string) (*Milestone, error) {
	if in.Product == nil || strings.TrimSpace(*in.Product) == "" {
		return nil, invalid("a milestone needs a product")
	}
	p, err := s.Product(*in.Product)
	if errors.Is(err, ErrNotFound) {
		return nil, invalid("there's no product %q", *in.Product)
	} else if err != nil {
		return nil, err
	}
	m := &Milestone{Status: "open"}
	if err := in.apply(m); err != nil {
		return nil, err
	}
	t := now()
	res, err := s.db.Exec(`INSERT INTO milestones (product_id, name, description, due, status, created, updated) VALUES (?,?,?,?,?,?,?)`,
		p.ID, m.Name, m.Description, m.Due, m.Status, t, t)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	_ = logActivity(s.db, nil, &p.ID, actor, "milestone", map[string][2]any{"created": {nil, m.Name}})
	return s.Milestone(id)
}

func (s *Store) UpdateMilestone(id int64, in MilestoneInput) (*Milestone, error) {
	m, err := s.Milestone(id)
	if err != nil {
		return nil, err
	}
	if err := in.apply(m); err != nil {
		return nil, err
	}
	_, err = s.db.Exec(`UPDATE milestones SET name=?, description=?, due=?, status=?, updated=? WHERE id=?`, m.Name, m.Description, m.Due, m.Status, now(), id)
	if err != nil {
		return nil, err
	}
	return s.Milestone(id)
}

// DeleteMilestone removes a milestone; its items stay, without one.
func (s *Store) DeleteMilestone(id int64) (*Milestone, error) {
	m, err := s.Milestone(id)
	if err != nil {
		return nil, err
	}
	_, err = s.db.Exec(`DELETE FROM milestones WHERE id = ?`, id)
	return m, err
}
