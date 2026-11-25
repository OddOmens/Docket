package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"strings"
	"time"
)

// API tokens let scripts and AI assistants (over MCP) use the API without a
// password. Only a hash is stored; the token is shown once, when it's made.
// A token can never reach account settings, sessions or other tokens.

// TokenPrefix starts every API token, so it's recognisable in a config file
// and to secret scanners.
const TokenPrefix = "dkt_"

type APIToken struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Hint     string `json:"hint"` // the last four characters
	Scope    string `json:"scope"`
	Created  int64  `json:"created"`
	LastUsed int64  `json:"lastUsed"`
	Expires  int64  `json:"expires"`
}

func (s *Store) CreateToken(name, scope string, ttl time.Duration) (string, *APIToken, error) {
	name, err := cleanLine(name, 60, "name")
	if err != nil {
		return "", nil, err
	}
	if name == "" {
		return "", nil, invalid("give the token a name, like Claude")
	}
	// Comments made with a token belong to its name, so a name can't be
	// shared with another token or with you.
	if strings.EqualFold(name, "You") {
		return "", nil, invalid(`"You" is how Docket shows your own changes; pick another name`)
	}
	var taken int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM api_tokens WHERE name = ? COLLATE NOCASE`, name).Scan(&taken); err != nil {
		return "", nil, err
	}
	if taken > 0 {
		return "", nil, invalid("there's already a token with that name")
	}
	if scope != "read" && scope != "write" {
		return "", nil, invalid("scope must be read or write")
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", nil, err
	}
	token := TokenPrefix + base64.RawURLEncoding.EncodeToString(buf)
	h := hashToken(token)
	t := &APIToken{ID: h[:16], Name: name, Hint: token[len(token)-4:], Scope: scope, Created: now()}
	if ttl > 0 {
		t.Expires = time.Now().Add(ttl).Unix()
	}
	_, err = s.db.Exec(`INSERT INTO api_tokens (id, token_hash, name, hint, scope, created, expires) VALUES (?,?,?,?,?,?,?)`,
		t.ID, h, t.Name, t.Hint, t.Scope, t.Created, t.Expires)
	return token, t, err
}

// CheckToken returns the token's record if it's live.
func (s *Store) CheckToken(token string) (*APIToken, error) {
	if !strings.HasPrefix(token, TokenPrefix) {
		return nil, nil
	}
	var t APIToken
	err := s.db.QueryRow(`SELECT id, name, hint, scope, created, last_used, expires FROM api_tokens WHERE token_hash = ?`, hashToken(token)).
		Scan(&t.ID, &t.Name, &t.Hint, &t.Scope, &t.Created, &t.LastUsed, &t.Expires)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	n := now()
	if t.Expires > 0 && n > t.Expires {
		return nil, nil
	}
	if n-t.LastUsed > 60 {
		_, _ = s.db.Exec(`UPDATE api_tokens SET last_used = ? WHERE id = ?`, n, t.ID)
	}
	return &t, nil
}

func (s *Store) Tokens() ([]APIToken, error) {
	rows, err := s.db.Query(`SELECT id, name, hint, scope, created, last_used, expires FROM api_tokens ORDER BY created DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []APIToken{}
	for rows.Next() {
		var t APIToken
		if err := rows.Scan(&t.ID, &t.Name, &t.Hint, &t.Scope, &t.Created, &t.LastUsed, &t.Expires); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) DeleteToken(id string) error {
	res, err := s.db.Exec(`DELETE FROM api_tokens WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteAllTokens revokes every API token (after a password change).
func (s *Store) DeleteAllTokens() error {
	_, err := s.db.Exec(`DELETE FROM api_tokens`)
	return err
}
