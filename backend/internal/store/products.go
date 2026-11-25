package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

type Product struct {
	ID          int64   `json:"id"`
	Key         string  `json:"key"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Group       string  `json:"group"`
	Icon        string  `json:"icon"`
	Color       string  `json:"color"`
	Version     string  `json:"version"`
	Links       []Link  `json:"links"`
	Position    float64 `json:"position"`
	Created     int64   `json:"created"`
	Updated     int64   `json:"updated"`
	// Counts are filled in by Products and Product.
	Counts *ProductCounts `json:"counts,omitempty"`
}

type ProductCounts struct {
	Open       int            `json:"open"`
	Closed     int            `json:"closed"`
	ByStatus   map[string]int `json:"byStatus"`
	BySeverity map[string]int `json:"bySeverity"` // open items only
	ByType     map[string]int `json:"byType"`     // open items only
	Overdue    int            `json:"overdue"`
}

// ProductInput is a create or a partial update: nil fields are left alone.
type ProductInput struct {
	Key         *string `json:"key"`
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
	Group       *string `json:"group"`
	Icon        *string `json:"icon"`
	Color       *string `json:"color"`
	Version     *string `json:"version"`
	Links       *[]Link `json:"links"`
}

const productCols = `id, key, name, description, status, grp, icon, color, version, links, position, created, updated`

func scanProduct(row interface{ Scan(...any) error }) (*Product, error) {
	var p Product
	var links string
	if err := row.Scan(&p.ID, &p.Key, &p.Name, &p.Description, &p.Status, &p.Group, &p.Icon, &p.Color, &p.Version, &links, &p.Position, &p.Created, &p.Updated); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	_ = json.Unmarshal([]byte(links), &p.Links)
	if p.Links == nil {
		p.Links = []Link{}
	}
	return &p, nil
}

func (in *ProductInput) apply(p *Product) error {
	var err error
	if in.Key != nil {
		k := strings.ToUpper(strings.TrimSpace(*in.Key))
		if !keyRe.MatchString(k) {
			return invalid("key must be 2 to 8 letters or digits, starting with a letter, like PLN")
		}
		if k == InboxKey {
			return invalid("the key %s is reserved for the inbox", InboxKey)
		}
		p.Key = k
	}
	if in.Name != nil {
		if p.Name, err = cleanLine(*in.Name, maxName, "name"); err != nil {
			return err
		}
	}
	if p.Name == "" {
		return invalid("a product needs a name")
	}
	if in.Description != nil {
		if p.Description, err = cleanText(*in.Description, maxDesc, "description"); err != nil {
			return err
		}
	}
	if in.Status != nil {
		if err := oneOf("status", *in.Status, ProductStatuses); err != nil {
			return err
		}
		p.Status = *in.Status
	}
	if in.Group != nil {
		if p.Group, err = cleanLine(*in.Group, 60, "group"); err != nil {
			return err
		}
	}
	if in.Icon != nil {
		if !iconRe.MatchString(*in.Icon) {
			return invalid("icon must be a Lucide icon name like rocket")
		}
		p.Icon = *in.Icon
	}
	if in.Color != nil {
		if !colorRe.MatchString(*in.Color) {
			return invalid("color must be a hex colour like #3b5bdb or a name like blue")
		}
		p.Color = *in.Color
	}
	if in.Version != nil {
		if p.Version, err = cleanLine(*in.Version, 40, "version"); err != nil {
			return err
		}
	}
	if in.Links != nil {
		if p.Links, err = cleanLinks(*in.Links); err != nil {
			return err
		}
	}
	return nil
}

// suggestKey makes a key from a name: initials, or the first letters.
func suggestKey(name string) string {
	var b strings.Builder
	words := strings.FieldsFunc(strings.ToUpper(name), func(r rune) bool { return !(r >= 'A' && r <= 'Z' || r >= '0' && r <= '9') })
	if len(words) >= 2 {
		for _, w := range words {
			if b.Len() < 4 {
				b.WriteByte(w[0])
			}
		}
	} else if len(words) == 1 {
		w := words[0]
		b.WriteString(w[:min(3, len(w))])
	}
	k := b.String()
	if len(k) < 2 || k[0] < 'A' || k[0] > 'Z' || k == InboxKey {
		k = "P" + k
	}
	if len(k) < 2 {
		k += "X"
	}
	return k
}

func (s *Store) CreateProduct(in ProductInput) (*Product, error) {
	p := &Product{Status: "active", Links: []Link{}}
	if in.Key == nil || strings.TrimSpace(*in.Key) == "" {
		in.Key = nil
	}
	if err := in.apply(p); err != nil {
		return nil, err
	}
	if p.Key == "" {
		base := suggestKey(p.Name)
		p.Key = base
		for i := 2; ; i++ {
			if _, err := s.Product(p.Key); errors.Is(err, ErrNotFound) {
				break
			}
			p.Key = base[:min(len(base), 6)] + itoa(i)
		}
	}
	links, _ := json.Marshal(p.Links)
	t := now()
	res, err := s.db.Exec(`INSERT INTO products (key, name, description, status, grp, icon, color, version, links, position, created, updated)
		VALUES (?,?,?,?,?,?,?,?,?, (SELECT IFNULL(MAX(position), 0) + 1 FROM products), ?,?)`,
		p.Key, p.Name, p.Description, p.Status, p.Group, p.Icon, p.Color, p.Version, string(links), t, t)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, invalid("the key %s is already used by another product", p.Key)
		}
		return nil, err
	}
	id, _ := res.LastInsertId()
	if err := keepSections(s.db); err != nil {
		return nil, err
	}
	return s.productByID(id)
}

func (s *Store) UpdateProduct(ref string, in ProductInput) (*Product, map[string][2]any, error) {
	p, err := s.Product(ref)
	if err != nil {
		return nil, nil, err
	}
	before := *p
	if err := in.apply(p); err != nil {
		return nil, nil, err
	}
	links, _ := json.Marshal(p.Links)
	_, err = s.db.Exec(`UPDATE products SET key=?, name=?, description=?, status=?, grp=?, icon=?, color=?, version=?, links=?, updated=? WHERE id=?`,
		p.Key, p.Name, p.Description, p.Status, p.Group, p.Icon, p.Color, p.Version, string(links), now(), p.ID)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, nil, invalid("the key %s is already used by another product", p.Key)
		}
		return nil, nil, err
	}
	if err := keepSections(s.db); err != nil {
		return nil, nil, err
	}
	changes := map[string][2]any{}
	diff := func(field string, a, b any) {
		if a != b {
			changes[field] = [2]any{a, b}
		}
	}
	diff("key", before.Key, p.Key)
	diff("name", before.Name, p.Name)
	diff("status", before.Status, p.Status)
	diff("group", before.Group, p.Group)
	diff("version", before.Version, p.Version)
	if before.Description != p.Description {
		changes["description"] = [2]any{nil, nil}
	}
	out, err := s.productByID(p.ID)
	return out, changes, err
}

// Product finds a product by key (any case) or numeric id.
func (s *Store) Product(ref string) (*Product, error) {
	ref = strings.TrimSpace(ref)
	if id, ok := atoi(ref); ok {
		return s.productByID(id)
	}
	return scanProduct(s.db.QueryRow(`SELECT `+productCols+` FROM products WHERE key = ?`, ref))
}

func (s *Store) productByID(id int64) (*Product, error) {
	return scanProduct(s.db.QueryRow(`SELECT `+productCols+` FROM products WHERE id = ?`, id))
}

// Products lists every product in sidebar order, with item counts.
func (s *Store) Products() ([]*Product, error) {
	rows, err := s.db.Query(`SELECT ` + productCols + ` FROM products ORDER BY position, id`)
	if err != nil {
		return nil, err
	}
	out := []*Product{}
	byID := map[int64]*Product{}
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		p.Counts = newCounts()
		out = append(out, p)
		byID[p.ID] = p
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, s.fillCounts(byID)
}

func newCounts() *ProductCounts {
	return &ProductCounts{ByStatus: map[string]int{}, BySeverity: map[string]int{}, ByType: map[string]int{}}
}

func (s *Store) fillCounts(byID map[int64]*Product) error {
	today := Today()
	rows, err := s.db.Query(`SELECT product_id, status, severity, type, COUNT(*), SUM(due <> '' AND due < ?) FROM items
		WHERE deleted_at = 0 AND product_id IS NOT NULL GROUP BY product_id, status, severity, type`, today)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var status, sev, typ string
		var n, overdue int
		if err := rows.Scan(&id, &status, &sev, &typ, &n, &overdue); err != nil {
			return err
		}
		p := byID[id]
		if p == nil {
			continue
		}
		c := p.Counts
		c.ByStatus[status] += n
		if Closed(status) {
			c.Closed += n
			continue
		}
		c.Open += n
		c.BySeverity[sev] += n
		c.ByType[typ] += n
		c.Overdue += overdue
	}
	return rows.Err()
}

// ProductWithCounts is Product plus its counts.
func (s *Store) ProductWithCounts(ref string) (*Product, error) {
	p, err := s.Product(ref)
	if err != nil {
		return nil, err
	}
	p.Counts = newCounts()
	return p, s.fillCounts(map[int64]*Product{p.ID: p})
}

// OrderProducts sets the sidebar: products in order (keys), each product's
// section where it changes (groups), and, if given, the order of the
// section headings (sections), which may include empty ones. Sections used
// by a product but missing from sections are kept, at the end.
func (s *Store) OrderProducts(keys []string, groups map[string]string, sections []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, k := range keys {
		if _, err := tx.Exec(`UPDATE products SET position = ? WHERE key = ?`, i+1, k); err != nil {
			return err
		}
	}
	for k, g := range groups {
		g, err := cleanLine(g, 60, "section")
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE products SET grp = ? WHERE key = ?`, g, k); err != nil {
			return err
		}
	}
	if sections != nil {
		if _, err := tx.Exec(`DELETE FROM sections`); err != nil {
			return err
		}
		for _, name := range sections {
			name, err := cleanLine(name, 60, "section")
			if err != nil {
				return err
			}
			if name == "" {
				continue
			}
			if _, err := tx.Exec(`INSERT OR IGNORE INTO sections (name, position) VALUES (?, (SELECT IFNULL(MAX(position), 0) + 1 FROM sections))`, name); err != nil {
				return err
			}
		}
	}
	if err := keepSections(tx); err != nil {
		return err
	}
	return tx.Commit()
}

// keepSections adds any heading a product uses that the sections table
// doesn't list yet, at the end.
func keepSections(db execer) error {
	_, err := db.Exec(`INSERT OR IGNORE INTO sections (name, position)
		SELECT grp, (SELECT IFNULL(MAX(position), 0) FROM sections) + ROW_NUMBER() OVER (ORDER BY MIN(position))
		FROM products WHERE grp <> '' AND grp NOT IN (SELECT name FROM sections) GROUP BY grp`)
	return err
}

// Groups lists the sidebar section headings in order, empty ones included.
func (s *Store) Groups() ([]string, error) {
	if err := keepSections(s.db); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`SELECT name FROM sections ORDER BY position, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var g string
		if err := rows.Scan(&g); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// CreateSection adds an empty heading at the end of the sidebar.
func (s *Store) CreateSection(name string) error {
	name, err := cleanLine(name, 60, "section")
	if err != nil {
		return err
	}
	if name == "" {
		return invalid("give the section a name")
	}
	res, err := s.db.Exec(`INSERT OR IGNORE INTO sections (name, position) VALUES (?, (SELECT IFNULL(MAX(position), 0) + 1 FROM sections))`, name)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return invalid("there's already a section called %s", name)
	}
	return nil
}

// RenameSection renames a heading and moves its products with it.
func (s *Store) RenameSection(old, name string) error {
	name, err := cleanLine(name, 60, "section")
	if err != nil {
		return err
	}
	if name == "" {
		return invalid("give the section a name")
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM sections WHERE name = ?`, old).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	if !strings.EqualFold(old, name) {
		if err := tx.QueryRow(`SELECT COUNT(*) FROM sections WHERE name = ?`, name).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			return invalid("there's already a section called %s", name)
		}
	}
	if _, err := tx.Exec(`UPDATE sections SET name = ? WHERE name = ?`, name, old); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE products SET grp = ? WHERE grp = ? COLLATE NOCASE`, name, old); err != nil {
		return err
	}
	return tx.Commit()
}

// DeleteSection removes a heading; its products stay, without a section.
func (s *Store) DeleteSection(name string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.Exec(`DELETE FROM sections WHERE name = ?`, name)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	if _, err := tx.Exec(`UPDATE products SET grp = '' WHERE grp = ? COLLATE NOCASE`, name); err != nil {
		return err
	}
	return tx.Commit()
}

// DeleteProduct removes a product with its items, milestones and history.
func (s *Store) DeleteProduct(ref string) (*Product, error) {
	p, err := s.Product(ref)
	if err != nil {
		return nil, err
	}
	_, err = s.db.Exec(`DELETE FROM products WHERE id = ?`, p.ID)
	return p, err
}
