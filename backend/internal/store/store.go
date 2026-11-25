// Package store is Docket's SQLite database: products, their work items,
// milestones, comments and activity, plus the owner's account, sign-in
// sessions and API tokens.
package store

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

var (
	ErrNotFound = errors.New("not found")
	// ErrInvalid wraps a message that's safe to show: a bad field value.
	ErrInvalid = errors.New("invalid")
	// ErrConflict is a key or name that's already taken.
	ErrConflict = errors.New("conflict")
)

// Invalid is a validation error whose message is shown to the caller.
type Invalid struct{ Msg string }

func (e *Invalid) Error() string        { return e.Msg }
func (e *Invalid) Is(target error) bool { return target == ErrInvalid }

func invalid(format string, a ...any) error { return &Invalid{Msg: fmt.Sprintf(format, a...)} }

// migrations run in order; PRAGMA user_version records how many have run.
var migrations = []string{`
CREATE TABLE account (
	id            INTEGER PRIMARY KEY CHECK (id = 1),
	name          TEXT NOT NULL,
	password_hash TEXT NOT NULL,
	totp_secret   TEXT NOT NULL DEFAULT '',
	totp_pending  TEXT NOT NULL DEFAULT '',
	totp_last     INTEGER NOT NULL DEFAULT 0,
	recovery      TEXT NOT NULL DEFAULT '[]',
	created       INTEGER NOT NULL,
	updated       INTEGER NOT NULL
);
CREATE TABLE sessions (
	id         TEXT NOT NULL UNIQUE,
	token_hash TEXT PRIMARY KEY,
	device     TEXT NOT NULL,
	ip         TEXT NOT NULL,
	user_agent TEXT NOT NULL,
	created    INTEGER NOT NULL,
	last_seen  INTEGER NOT NULL,
	expires    INTEGER NOT NULL
);
CREATE TABLE api_tokens (
	id         TEXT PRIMARY KEY,
	token_hash TEXT NOT NULL UNIQUE,
	name       TEXT NOT NULL,
	hint       TEXT NOT NULL,
	scope      TEXT NOT NULL CHECK (scope IN ('read', 'write')),
	created    INTEGER NOT NULL,
	last_used  INTEGER NOT NULL DEFAULT 0,
	expires    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE products (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	key         TEXT NOT NULL UNIQUE COLLATE NOCASE,
	name        TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	status      TEXT NOT NULL DEFAULT 'active',
	grp         TEXT NOT NULL DEFAULT '',
	icon        TEXT NOT NULL DEFAULT '',
	color       TEXT NOT NULL DEFAULT '',
	version     TEXT NOT NULL DEFAULT '',
	links       TEXT NOT NULL DEFAULT '[]',
	position    REAL NOT NULL DEFAULT 0,
	next_number INTEGER NOT NULL DEFAULT 1,
	created     INTEGER NOT NULL,
	updated     INTEGER NOT NULL
);
CREATE TABLE milestones (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
	name        TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	due         TEXT NOT NULL DEFAULT '',
	status      TEXT NOT NULL DEFAULT 'open',
	created     INTEGER NOT NULL,
	updated     INTEGER NOT NULL
);
CREATE INDEX milestones_product ON milestones(product_id);
CREATE TABLE items (
	id           INTEGER PRIMARY KEY AUTOINCREMENT,
	product_id   INTEGER REFERENCES products(id) ON DELETE CASCADE,
	number       INTEGER NOT NULL,
	type         TEXT NOT NULL,
	title        TEXT NOT NULL,
	body         TEXT NOT NULL DEFAULT '',
	status       TEXT NOT NULL,
	severity     TEXT NOT NULL,
	labels       TEXT NOT NULL DEFAULT '[]',
	start_date   TEXT NOT NULL DEFAULT '',
	due          TEXT NOT NULL DEFAULT '',
	milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
	position     REAL NOT NULL DEFAULT 0,
	created_by   TEXT NOT NULL DEFAULT '',
	created      INTEGER NOT NULL,
	updated      INTEGER NOT NULL,
	closed_at    INTEGER NOT NULL DEFAULT 0,
	deleted_at   INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX items_number ON items(IFNULL(product_id, 0), number);
CREATE INDEX items_status ON items(status, position);
CREATE INDEX items_due ON items(due) WHERE due <> '';
CREATE TABLE comments (
	id      INTEGER PRIMARY KEY AUTOINCREMENT,
	item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
	author  TEXT NOT NULL,
	body    TEXT NOT NULL,
	created INTEGER NOT NULL,
	updated INTEGER NOT NULL
);
CREATE INDEX comments_item ON comments(item_id, created);
CREATE TABLE activity (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	item_id    INTEGER REFERENCES items(id) ON DELETE CASCADE,
	product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
	actor      TEXT NOT NULL,
	action     TEXT NOT NULL,
	detail     TEXT NOT NULL DEFAULT '{}',
	created    INTEGER NOT NULL
);
CREATE INDEX activity_item ON activity(item_id, created);
CREATE INDEX activity_created ON activity(created);
CREATE TABLE inbox (
	id          INTEGER PRIMARY KEY CHECK (id = 1),
	next_number INTEGER NOT NULL
);
INSERT INTO inbox (id, next_number) VALUES (1, 1);
`, `
-- Sidebar section headings, in order; they can exist with no products.
CREATE TABLE sections (
	name     TEXT PRIMARY KEY COLLATE NOCASE,
	position INTEGER NOT NULL
);
INSERT INTO sections (name, position)
	SELECT grp, ROW_NUMBER() OVER (ORDER BY MIN(position)) FROM products WHERE grp <> '' GROUP BY grp;
`}

type Store struct {
	db *sql.DB
}

func Open(file string) (*Store, error) {
	db, err := sql.Open("sqlite", "file:"+file+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)&_pragma=journal_size_limit(67108864)&_pragma=temp_store(memory)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	// One connection: writes are tiny, and it rules out SQLITE_BUSY.
	db.SetMaxOpenConns(1)
	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return &Store{db: db}, nil
}

func migrate(db *sql.DB) error {
	var version int
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return err
	}
	if version > len(migrations) {
		return fmt.Errorf("the database is from a newer Docket (schema %d, this one knows %d)", version, len(migrations))
	}
	for i := version; i < len(migrations); i++ {
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(migrations[i]); err != nil {
			tx.Rollback()
			return err
		}
		if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, i+1)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Close() error { return s.db.Close() }

// Check runs SQLite's quick integrity check.
func (s *Store) Check() error {
	var res string
	if err := s.db.QueryRow(`PRAGMA quick_check`).Scan(&res); err != nil {
		return err
	}
	if res != "ok" {
		return errors.New(res)
	}
	return nil
}

// Tidy is the periodic housekeeping: expired sessions and tokens go, and
// items in the trash longer than retention are deleted for good.
func (s *Store) Tidy(retention time.Duration) (purged int, err error) {
	now := time.Now()
	if _, err := s.db.Exec(`DELETE FROM sessions WHERE expires < ? OR created < ?`, now.Unix(), now.Add(-sessionMaxAge).Unix()); err != nil {
		return 0, err
	}
	if _, err := s.db.Exec(`DELETE FROM api_tokens WHERE expires > 0 AND expires < ?`, now.Unix()); err != nil {
		return 0, err
	}
	res, err := s.db.Exec(`DELETE FROM items WHERE deleted_at > 0 AND deleted_at < ?`, now.Add(-retention).Unix())
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	_, err = s.db.Exec(`PRAGMA optimize`)
	return int(n), err
}

// Backup writes a consistent copy of the database to file.
func (s *Store) Backup(file string) error {
	_, err := s.db.Exec(`VACUUM INTO ?`, file)
	return err
}

func now() int64 { return time.Now().Unix() }
