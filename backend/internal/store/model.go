package store

import (
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

// The fixed vocabularies. The web UI, the REST API and the MCP tools all use
// these exact strings.
var (
	ProductStatuses = []string{"planning", "active", "beta", "maintenance", "paused", "deprecated", "archived"}
	ItemTypes       = []string{"feature", "bug", "task", "improvement", "chore", "idea"}
	ItemStatuses    = []string{"backlog", "todo", "in_progress", "review", "done", "cancelled"}
	Severities      = []string{"low", "medium", "high", "critical"}
	MilestoneStates = []string{"open", "done"}
)

// Closed statuses: the work is over, one way or another.
func Closed(status string) bool { return status == "done" || status == "cancelled" }

// InboxKey is the prefix of items that belong to no product yet.
const InboxKey = "IN"

// Limits on what's stored, so one runaway client can't fill the disk.
const (
	maxTitle    = 300
	maxBody     = 200_000
	maxName     = 120
	maxDesc     = 20_000
	maxLabels   = 20
	maxLabelLen = 40
	maxLinks    = 12
	maxURL      = 2000
	maxComment  = 50_000
)

var keyRe = regexp.MustCompile(`^[A-Z][A-Z0-9]{1,7}$`)

func oneOf(field, v string, allowed []string) error {
	if !slices.Contains(allowed, v) {
		return invalid("%s must be one of: %s", field, strings.Join(allowed, ", "))
	}
	return nil
}

// cleanLine trims and collapses whitespace in a one-line field.
func cleanLine(s string, limit int, field string) (string, error) {
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) > limit {
		return "", invalid("%s is longer than %d characters", field, limit)
	}
	return s, nil
}

func cleanText(s string, limit int, field string) (string, error) {
	s = strings.TrimRight(strings.ReplaceAll(s, "\r\n", "\n"), " \n\t")
	if len(s) > limit {
		return "", invalid("%s is too long (limit %d bytes)", field, limit)
	}
	if !utf8.ValidString(s) {
		return "", invalid("%s isn't valid text", field)
	}
	return s, nil
}

// cleanDate accepts "" or YYYY-MM-DD.
func cleanDate(s, field string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", nil
	}
	if _, err := time.Parse(time.DateOnly, s); err != nil {
		return "", invalid("%s must be a date like 2026-11-30", field)
	}
	return s, nil
}

// cleanLabels lower-cases, trims and dedupes labels.
func cleanLabels(in []string) ([]string, error) {
	out := []string{}
	for _, l := range in {
		l = strings.ToLower(strings.Join(strings.Fields(l), "-"))
		l = strings.Trim(l, "#")
		if l == "" || slices.Contains(out, l) {
			continue
		}
		if utf8.RuneCountInString(l) > maxLabelLen {
			return nil, invalid("label %q is longer than %d characters", l, maxLabelLen)
		}
		out = append(out, l)
	}
	if len(out) > maxLabels {
		return nil, invalid("an item can have at most %d labels", maxLabels)
	}
	return out, nil
}

var colorRe = regexp.MustCompile(`^(#[0-9a-fA-F]{6}|[a-z]{3,12})?$`)
var iconRe = regexp.MustCompile(`^[a-z0-9-]{0,48}$`)

type Link struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

func cleanLinks(in []Link) ([]Link, error) {
	out := []Link{}
	for _, l := range in {
		l.Label, _ = cleanLine(l.Label, 60, "link label")
		l.URL = strings.TrimSpace(l.URL)
		if l.URL == "" {
			continue
		}
		if len(l.URL) > maxURL || !(strings.HasPrefix(l.URL, "https://") || strings.HasPrefix(l.URL, "http://")) {
			return nil, invalid("links must be http:// or https:// addresses")
		}
		out = append(out, l)
	}
	if len(out) > maxLinks {
		return nil, invalid("a product can have at most %d links", maxLinks)
	}
	return out, nil
}
