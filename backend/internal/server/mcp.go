package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/oddomens/docket/internal/store"
)

// Docket speaks the Model Context Protocol over Streamable HTTP at /mcp:
// each POST carries one JSON-RPC message (or a batch) and gets a JSON
// answer. There are no server-initiated messages, so GET has no stream and
// there are no sessions. Every request needs an API token; a read-only
// token sees only the tools that read.

var mcpVersions = []string{"2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"}

const mcpInstructions = `Docket tracks work across the owner's products (apps, sites, servers, tools, games…).
- A product has a short KEY (e.g. PLN) and a status: planning, active, beta, maintenance, paused, deprecated, archived.
- Work items are referenced as KEY-NUMBER (e.g. PLN-12). Items with no product live in the inbox (refs IN-n).
- Item type: feature, bug, task, improvement, chore, idea. Status: backlog, todo, in_progress, review, done, cancelled.
- Severity: low, medium, high, critical. Dates are YYYY-MM-DD. Labels are short lowercase tags.
- Item bodies are Markdown; "- [ ] step" lines become a checklist.
Look up product keys with list_products before creating items. Prefer update_item with append_body or add_comment to record progress instead of rewriting a body. Deleting moves an item to the trash, where the owner can restore it.`

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

func (s *Server) mcp(w http.ResponseWriter, r *http.Request) {
	if authOf(r).token == nil {
		writeErr(w, http.StatusUnauthorized, "the MCP endpoint needs an API token: Settings → API & MCP")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var raw json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeJSON(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{-32700, "parse error"}})
		return
	}
	raw = bytes.TrimSpace(raw)
	if len(raw) > 0 && raw[0] == '[' {
		var batch []rpcRequest
		if err := json.Unmarshal(raw, &batch); err != nil || len(batch) == 0 || len(batch) > maxBatch {
			writeJSON(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{-32600, "invalid batch"}})
			return
		}
		// Each call in a batch counts against the token's rate limit, like a
		// request of its own (the request itself was counted already).
		if t := authOf(r).token; t != nil {
			for range len(batch) - 1 {
				if !s.tokenLimiter.allow(t.ID) {
					writeErr(w, http.StatusTooManyRequests, "too many requests with this token; slow down")
					return
				}
			}
		}
		out := []rpcResponse{}
		for _, req := range batch {
			if res, ok := s.rpc(r, req); ok {
				out = append(out, res)
			}
		}
		if len(out) == 0 {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		writeJSON(w, http.StatusOK, out)
		return
	}
	var req rpcRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{-32600, "invalid request"}})
		return
	}
	res, ok := s.rpc(r, req)
	if !ok {
		// A notification or a response: nothing to answer.
		w.WriteHeader(http.StatusAccepted)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// rpc handles one message; ok is false for notifications.
// maxBatch is the most calls one MCP request may hold.
const maxBatch = 20

func (s *Server) rpc(r *http.Request, req rpcRequest) (rpcResponse, bool) {
	if len(req.ID) == 0 || string(req.ID) == "null" {
		return rpcResponse{}, false
	}
	res := rpcResponse{JSONRPC: "2.0", ID: req.ID}
	if req.JSONRPC != "2.0" {
		res.Error = &rpcError{-32600, "jsonrpc must be 2.0"}
		return res, true
	}
	switch req.Method {
	case "initialize":
		var p struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(req.Params, &p)
		version := mcpVersions[0]
		if slices.Contains(mcpVersions, p.ProtocolVersion) {
			version = p.ProtocolVersion
		}
		res.Result = map[string]any{
			"protocolVersion": version,
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": false}},
			"serverInfo":      map[string]any{"name": "docket", "title": "Docket", "version": s.cfg.Version},
			"instructions":    mcpInstructions,
		}
	case "ping":
		res.Result = map[string]any{}
	case "tools/list":
		tools := []map[string]any{}
		canWrite := authOf(r).token.Scope == "write"
		for _, t := range mcpTools {
			if t.write && !canWrite {
				continue
			}
			def := map[string]any{"name": t.name, "description": t.desc, "inputSchema": t.schema}
			def["annotations"] = map[string]any{"readOnlyHint": !t.write, "destructiveHint": t.name == "delete_item", "openWorldHint": false}
			tools = append(tools, def)
		}
		res.Result = map[string]any{"tools": tools}
	case "tools/call":
		var p struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil {
			res.Error = &rpcError{-32602, "invalid params"}
			return res, true
		}
		res.Result = s.callTool(r, p.Name, p.Arguments)
	case "resources/list":
		res.Result = map[string]any{"resources": []any{}}
	case "prompts/list":
		res.Result = map[string]any{"prompts": []any{}}
	default:
		res.Error = &rpcError{-32601, "method not found: " + req.Method}
	}
	return res, true
}

type mcpTool struct {
	name   string
	desc   string
	write  bool
	schema map[string]any
	run    func(s *Server, r *http.Request, args json.RawMessage) (any, error)
}

// toolResult wraps a tool's answer, or its error, as MCP content.
func toolResult(v any, err error) map[string]any {
	if err != nil {
		msg := "something went wrong"
		var inv *store.Invalid
		switch {
		case errors.As(err, &inv):
			msg = inv.Msg
		case errors.Is(err, store.ErrNotFound):
			msg = "not found"
		case errors.Is(err, errToolInput):
			msg = err.Error()
		}
		return map[string]any{"content": []any{map[string]any{"type": "text", "text": "Error: " + msg}}, "isError": true}
	}
	b, _ := json.MarshalIndent(v, "", " ")
	out := map[string]any{"content": []any{map[string]any{"type": "text", "text": string(b)}}}
	if _, isMap := v.(map[string]any); isMap {
		out["structuredContent"] = v
	}
	return out
}

var errToolInput = errors.New("invalid arguments")

func inputErr(format string, a ...any) error {
	return fmt.Errorf("%w: %s", errToolInput, fmt.Sprintf(format, a...))
}

func (s *Server) callTool(r *http.Request, name string, args json.RawMessage) map[string]any {
	i := slices.IndexFunc(mcpTools, func(t mcpTool) bool { return t.name == name })
	if i < 0 {
		return toolResult(nil, inputErr("there's no tool %q", name))
	}
	t := mcpTools[i]
	if t.write && authOf(r).token.Scope != "write" {
		return toolResult(nil, inputErr("this API token is read-only"))
	}
	if len(args) == 0 || string(args) == "null" {
		args = json.RawMessage("{}")
	}
	v, err := t.run(s, r, args)
	if err != nil {
		var inv *store.Invalid
		if !errors.As(err, &inv) && !errors.Is(err, store.ErrNotFound) && !errors.Is(err, errToolInput) {
			s.log.Error("MCP tool failed", "tool", name, "err", err)
		}
	}
	return toolResult(v, err)
}

func decode(args json.RawMessage, v any) error {
	d := json.NewDecoder(bytes.NewReader(args))
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return inputErr("%s", strings.TrimPrefix(err.Error(), "json: "))
	}
	return nil
}

// ── Schemas ──

func obj(required []string, props map[string]any) map[string]any {
	o := map[string]any{"type": "object", "properties": props, "additionalProperties": false}
	if len(required) > 0 {
		o["required"] = required
	}
	return o
}

func str(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }

func enum(desc string, vals []string) map[string]any {
	return map[string]any{"type": "string", "enum": vals, "description": desc}
}

func enumList(desc string, vals []string) map[string]any {
	return map[string]any{"type": "array", "items": map[string]any{"type": "string", "enum": vals}, "description": desc}
}

func strList(desc string) map[string]any {
	return map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": desc}
}

var (
	pProduct = str("Product key (e.g. PLN) or id. Omit or \"IN\" for the inbox.")
	pRef     = str("Item ref like PLN-12 (or IN-3 for the inbox), or the numeric id.")
	pDate    = func(d string) map[string]any {
		return map[string]any{"type": "string", "description": d + " (YYYY-MM-DD, or \"\" to clear)", "pattern": `^(\d{4}-\d{2}-\d{2})?$`}
	}
	linkSchema = map[string]any{"type": "array", "items": obj([]string{"url"}, map[string]any{"label": str("Short label like Repo, Site, Docs"), "url": str("http(s) address")})}
)

func itemProps(create bool) map[string]any {
	p := map[string]any{
		"title":      str("One-line summary."),
		"type":       enum("Kind of work.", store.ItemTypes),
		"status":     enum("Workflow status.", store.ItemStatuses),
		"severity":   enum("How urgent or serious.", store.Severities),
		"body":       str("Markdown details. \"- [ ] step\" lines form a checklist. Replaces the whole body."),
		"labels":     strList("Short lowercase tags; replaces all labels."),
		"due":        pDate("Due date"),
		"start_date": pDate("Start date"),
		"milestone":  str("Milestone name or id in the item's product; \"\" to clear."),
		"product":    pProduct,
	}
	if !create {
		p["append_body"] = str("Markdown to add to the end of the body (keeps what's there).")
		p["add_labels"] = strList("Labels to add.")
		p["remove_labels"] = strList("Labels to remove.")
	}
	return p
}

type itemArgs struct {
	Ref          string    `json:"ref"`
	Title        *string   `json:"title"`
	Type         *string   `json:"type"`
	Status       *string   `json:"status"`
	Severity     *string   `json:"severity"`
	Body         *string   `json:"body"`
	AppendBody   *string   `json:"append_body"`
	Labels       *[]string `json:"labels"`
	AddLabels    []string  `json:"add_labels"`
	RemoveLabels []string  `json:"remove_labels"`
	Due          *string   `json:"due"`
	StartDate    *string   `json:"start_date"`
	Milestone    *string   `json:"milestone"`
	Product      *string   `json:"product"`
}

func (a itemArgs) input() store.ItemInput {
	return store.ItemInput{Product: a.Product, Type: a.Type, Title: a.Title, Body: a.Body, Status: a.Status, Severity: a.Severity,
		Labels: a.Labels, StartDate: a.StartDate, Due: a.Due, Milestone: a.Milestone, AddLabels: a.AddLabels,
		RemoveLabels: a.RemoveLabels, AppendBody: a.AppendBody}
}

// brief is an item without its body, for lists.
type brief struct {
	Ref       string   `json:"ref"`
	Title     string   `json:"title"`
	Product   string   `json:"product"`
	Type      string   `json:"type"`
	Status    string   `json:"status"`
	Severity  string   `json:"severity"`
	Labels    []string `json:"labels,omitempty"`
	Due       string   `json:"due,omitempty"`
	Milestone string   `json:"milestone,omitempty"`
	Checklist string   `json:"checklist,omitempty"`
	Updated   string   `json:"updated"`
}

func briefOf(it *store.Item) brief {
	b := brief{Ref: it.Ref, Title: it.Title, Product: it.ProductName, Type: it.Type, Status: it.Status, Severity: it.Severity,
		Labels: it.Labels, Due: it.Due, Milestone: it.Milestone, Updated: unixDate(it.Updated)}
	if it.Checklist.Total > 0 {
		b.Checklist = fmt.Sprintf("%d/%d", it.Checklist.Done, it.Checklist.Total)
	}
	return b
}

func briefs(items []*store.Item) []brief {
	out := make([]brief, len(items))
	for i, it := range items {
		out[i] = briefOf(it)
	}
	return out
}

func productBrief(p *store.Product) map[string]any {
	m := map[string]any{"key": p.Key, "name": p.Name, "status": p.Status}
	if p.Group != "" {
		m["group"] = p.Group
	}
	if p.Version != "" {
		m["version"] = p.Version
	}
	if p.Counts != nil {
		m["open"] = p.Counts.Open
		if n := p.Counts.BySeverity["critical"]; n > 0 {
			m["critical"] = n
		}
		if n := p.Counts.BySeverity["high"]; n > 0 {
			m["high"] = n
		}
		if p.Counts.Overdue > 0 {
			m["overdue"] = p.Counts.Overdue
		}
	}
	return m
}

var mcpTools []mcpTool

func init() {
	mcpTools = []mcpTool{
		{
			name: "overview", desc: "Start here: today's date, every product with open counts, totals, urgent (critical/high) items, items due soon and items in progress.",
			schema: obj(nil, map[string]any{}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				o, err := s.buildOverview()
				if err != nil {
					return nil, err
				}
				products := []any{}
				for _, p := range o.Products {
					if p.Status != "archived" {
						products = append(products, productBrief(p))
					}
				}
				return map[string]any{"today": o.Today, "totals": o.Totals, "products": products, "urgent": briefs(o.Urgent),
					"dueSoon": briefs(o.DueSoon), "inProgress": briefs(o.InProgress)}, nil
			},
		},
		{
			name: "list_products", desc: "List products with their keys, status, group and open item counts.",
			schema: obj(nil, map[string]any{"include_archived": map[string]any{"type": "boolean", "description": "Also list archived products."}}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a struct {
					IncludeArchived bool `json:"include_archived"`
				}
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				all, err := s.store.Products()
				if err != nil {
					return nil, err
				}
				out := []any{}
				for _, p := range all {
					if a.IncludeArchived || p.Status != "archived" {
						out = append(out, productBrief(p))
					}
				}
				return map[string]any{"products": out}, nil
			},
		},
		{
			name: "get_product", desc: "One product in full: description, links, version, counts by status/severity/type, and its milestones.",
			schema: obj([]string{"product"}, map[string]any{"product": str("Product key or id.")}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a struct {
					Product string `json:"product"`
				}
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				p, err := s.store.ProductWithCounts(a.Product)
				if err != nil {
					return nil, err
				}
				ms, err := s.store.Milestones(p.Key)
				if err != nil {
					return nil, err
				}
				return map[string]any{"product": p, "milestones": ms}, nil
			},
		},
		{
			name: "create_product", desc: "Add a product. The key is suggested from the name when omitted.", write: true,
			schema: obj([]string{"name"}, map[string]any{
				"name": str("Product name."), "key": str("2–8 capitals/digits starting with a letter, e.g. PLN. Used in item refs."),
				"status": enum("Lifecycle status (default active).", store.ProductStatuses), "group": str("Sidebar section heading, e.g. Self-hosted, Games."),
				"description": str("Markdown description."), "icon": str("Lucide icon name, e.g. rocket."), "color": str("Hex colour like #3b5bdb."),
				"version": str("Current version, e.g. 1.4.0."), "links": linkSchema,
			}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var in store.ProductInput
				if err := decode(args, &in); err != nil {
					return nil, err
				}
				p, err := s.store.CreateProduct(in)
				if err != nil {
					return nil, err
				}
				_ = s.store.LogProduct(p.ID, actor(r), "product", map[string][2]any{"created": {nil, p.Name}})
				s.publish(r, "products")
				return map[string]any{"product": p}, nil
			},
		},
		{
			name: "update_product", desc: "Change a product: name, key, status (e.g. maintenance, archived), group, description, version, links, icon, colour.", write: true,
			schema: obj([]string{"product"}, map[string]any{
				"product": str("Product key or id to change."), "name": str("New name."), "key": str("New key (renumbers nothing; refs change prefix)."),
				"status": enum("Lifecycle status.", store.ProductStatuses), "group": str("Sidebar section heading (\"\" for none)."),
				"description": str("Markdown description (replaces it)."), "icon": str("Lucide icon name."), "color": str("Hex colour."),
				"version": str("Current version."), "links": linkSchema,
			}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a struct {
					Product string `json:"product"`
					store.ProductInput
				}
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				p, changes, err := s.store.UpdateProduct(a.Product, a.ProductInput)
				if err != nil {
					return nil, err
				}
				if len(changes) > 0 {
					_ = s.store.LogProduct(p.ID, actor(r), "product", changes)
				}
				s.publish(r, "products", "items")
				return map[string]any{"product": p}, nil
			},
		},
		{
			name: "list_items", desc: "Find work items. By default only open items (not done/cancelled) of non-archived products, ordered by board position. Returns refs, titles and fields, not bodies.",
			schema: obj(nil, map[string]any{
				"product": pProduct, "section": str("Only items of products in this sidebar section (e.g. a product family like \"Plinthio\"). Ignored with product."),
				"status": enumList("Any of these statuses.", store.ItemStatuses), "type": enumList("Any of these types.", store.ItemTypes),
				"severity": enumList("Any of these severities.", store.Severities), "label": str("Only items with this label."),
				"milestone": str("Milestone id, or \"none\"."), "query": str("Words to find in title, body or labels; or a ref."),
				"include_closed": map[string]any{"type": "boolean", "description": "Include done and cancelled items."},
				"overdue":        map[string]any{"type": "boolean", "description": "Only open items past their due date."},
				"due_before":     pDate("Only items due on or before"),
				"sort":           enum("Order.", []string{"position", "updated", "created", "due", "severity"}),
				"limit":          map[string]any{"type": "integer", "minimum": 1, "maximum": 200, "description": "Default 50."},
				"offset":         map[string]any{"type": "integer", "minimum": 0},
			}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a struct {
					Product       string   `json:"product"`
					Section       string   `json:"section"`
					Status        []string `json:"status"`
					Type          []string `json:"type"`
					Severity      []string `json:"severity"`
					Label         string   `json:"label"`
					Milestone     string   `json:"milestone"`
					Query         string   `json:"query"`
					IncludeClosed bool     `json:"include_closed"`
					Overdue       bool     `json:"overdue"`
					DueBefore     string   `json:"due_before"`
					Sort          string   `json:"sort"`
					Limit         int      `json:"limit"`
					Offset        int      `json:"offset"`
				}
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				if a.Limit <= 0 || a.Limit > 200 {
					a.Limit = 50
				}
				f := store.Filter{Product: a.Product, Section: a.Section, Status: a.Status, Type: a.Type, Severity: a.Severity, Label: a.Label, Milestone: a.Milestone,
					Query: a.Query, Open: !a.IncludeClosed && len(a.Status) == 0, Overdue: a.Overdue, DueTo: a.DueBefore, Sort: a.Sort, Limit: a.Limit, Offset: a.Offset}
				items, total, err := s.store.Items(f)
				if err != nil {
					return nil, err
				}
				return map[string]any{"items": briefs(items), "total": total, "shown": len(items), "offset": a.Offset}, nil
			},
		},
		{
			name: "get_item", desc: "One item in full: body (Markdown), fields, comments and its change history.",
			schema: obj([]string{"ref"}, map[string]any{"ref": pRef}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a struct {
					Ref string `json:"ref"`
				}
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				d, err := s.itemDetail(a.Ref)
				if err != nil {
					return nil, err
				}
				return map[string]any{"item": d}, nil
			},
		},
		{
			name: "create_item", desc: "Add a work item (feature, bug, task…) to a product, or to the inbox when no product is given. Defaults: type task, status backlog, severity medium.", write: true,
			schema: obj([]string{"title"}, itemProps(true)),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a itemArgs
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				it, err := s.store.CreateItem(a.input(), actor(r))
				if err != nil {
					return nil, err
				}
				s.publish(r, "items")
				return map[string]any{"item": briefOf(it)}, nil
			},
		},
		{
			name: "create_items", desc: "Add several work items at once (up to 50). Each takes the same fields as create_item. Stops at the first invalid one; those before it are kept.", write: true,
			schema: obj([]string{"items"}, map[string]any{"items": map[string]any{"type": "array", "maxItems": 50, "items": obj([]string{"title"}, itemProps(true))}}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a struct {
					Items []itemArgs `json:"items"`
				}
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				if len(a.Items) == 0 || len(a.Items) > 50 {
					return nil, inputErr("give between 1 and 50 items")
				}
				made := []brief{}
				defer func() {
					if len(made) > 0 {
						s.publish(r, "items")
					}
				}()
				for i, ia := range a.Items {
					it, err := s.store.CreateItem(ia.input(), actor(r))
					if err != nil {
						var inv *store.Invalid
						if errors.As(err, &inv) {
							return map[string]any{"created": made, "error": "item " + strconv.Itoa(i+1) + ": " + inv.Msg}, nil
						}
						return nil, err
					}
					made = append(made, briefOf(it))
				}
				return map[string]any{"created": made}, nil
			},
		},
		{
			name: "update_item", desc: "Change an item: any of its fields, move it to another product (it gets a new ref), append to its body, or add/remove labels. Only the fields given change.", write: true,
			schema: obj([]string{"ref"}, func() map[string]any { p := itemProps(false); p["ref"] = pRef; return p }()),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a itemArgs
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				it, err := s.store.UpdateItem(a.Ref, a.input(), actor(r))
				if err != nil {
					return nil, err
				}
				s.publish(r, "items")
				return map[string]any{"item": briefOf(it)}, nil
			},
		},
		{
			name: "add_comment", desc: "Add a Markdown comment to an item, e.g. a progress note or findings.", write: true,
			schema: obj([]string{"ref", "body"}, map[string]any{"ref": pRef, "body": str("Markdown comment.")}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a struct {
					Ref  string `json:"ref"`
					Body string `json:"body"`
				}
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				c, it, err := s.store.AddComment(a.Ref, a.Body, actor(r))
				if err != nil {
					return nil, err
				}
				s.publish(r, "items", "comments")
				return map[string]any{"ref": it.Ref, "comment": c}, nil
			},
		},
		{
			name: "delete_item", desc: "Move an item to the trash (the owner can restore it for 30 days). Prefer status cancelled for work that won't happen.", write: true,
			schema: obj([]string{"ref"}, map[string]any{"ref": pRef}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a struct {
					Ref string `json:"ref"`
				}
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				it, err := s.store.TrashItem(a.Ref, actor(r))
				if err != nil {
					return nil, err
				}
				s.publish(r, "items")
				return map[string]any{"trashed": it.Ref}, nil
			},
		},
		{
			name: "list_milestones", desc: "Milestones (releases or goals) with due dates and open/closed item counts; for one product or all.",
			schema: obj(nil, map[string]any{"product": str("Product key; omit for every product.")}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a struct {
					Product string `json:"product"`
				}
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				ms, err := s.store.Milestones(a.Product)
				if err != nil {
					return nil, err
				}
				return map[string]any{"milestones": ms}, nil
			},
		},
		{
			name: "create_milestone", desc: "Add a milestone (e.g. a release like v1.5) to a product.", write: true,
			schema: obj([]string{"product", "name"}, map[string]any{"product": str("Product key."), "name": str("Milestone name."),
				"due": pDate("Target date"), "description": str("Markdown description.")}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var in store.MilestoneInput
				if err := decode(args, &in); err != nil {
					return nil, err
				}
				m, err := s.store.CreateMilestone(in, actor(r))
				if err != nil {
					return nil, err
				}
				s.publish(r, "milestones")
				return map[string]any{"milestone": m}, nil
			},
		},
		{
			name: "update_milestone", desc: "Change a milestone's name, date, description, or mark it done.", write: true,
			schema: obj([]string{"id"}, map[string]any{"id": map[string]any{"type": "integer"}, "name": str("New name."), "due": pDate("Target date"),
				"description": str("Markdown description."), "status": enum("open or done.", store.MilestoneStates)}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a struct {
					ID int64 `json:"id"`
					store.MilestoneInput
				}
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				if a.MilestoneInput.Product != nil {
					return nil, inputErr("a milestone can't move to another product")
				}
				m, err := s.store.UpdateMilestone(a.ID, a.MilestoneInput)
				if err != nil {
					return nil, err
				}
				s.publish(r, "milestones", "items")
				return map[string]any{"milestone": m}, nil
			},
		},
		{
			name: "list_labels", desc: "Labels in use, with how many items (and open items) carry each.",
			schema: obj(nil, map[string]any{}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				l, err := s.store.Labels()
				if err != nil {
					return nil, err
				}
				return map[string]any{"labels": l}, nil
			},
		},
		{
			name: "recent_activity", desc: "What changed lately (who changed what, newest first), for every product or one.",
			schema: obj(nil, map[string]any{"product": str("Product key; omit for all."), "limit": map[string]any{"type": "integer", "minimum": 1, "maximum": 200}}),
			run: func(s *Server, r *http.Request, args json.RawMessage) (any, error) {
				var a struct {
					Product string `json:"product"`
					Limit   int    `json:"limit"`
				}
				if err := decode(args, &a); err != nil {
					return nil, err
				}
				f := store.ActivityFilter{Limit: a.Limit}
				if a.Product != "" {
					p, err := s.store.Product(a.Product)
					if err != nil {
						return nil, err
					}
					f.ProductID = p.ID
				}
				act, err := s.store.Activity(f)
				if err != nil {
					return nil, err
				}
				return map[string]any{"activity": act}, nil
			},
		},
	}
}

func unixDate(t int64) string { return time.Unix(t, 0).Format(time.DateOnly) }
