import { forgetShell } from "@/lib/shell-cache"

// ── Vocabularies (the server's exact strings; see backend/internal/store/model.go) ──

export const PRODUCT_STATUSES = ["planning", "active", "beta", "maintenance", "paused", "deprecated", "archived"] as const
export const ITEM_TYPES = ["feature", "bug", "task", "improvement", "chore", "idea"] as const
export const ITEM_STATUSES = ["backlog", "todo", "in_progress", "review", "done", "cancelled"] as const
export const SEVERITIES = ["low", "medium", "high", "critical"] as const

export type ProductStatus = (typeof PRODUCT_STATUSES)[number]
export type ItemType = (typeof ITEM_TYPES)[number]
export type ItemStatus = (typeof ITEM_STATUSES)[number]
export type Severity = (typeof SEVERITIES)[number]

export const isClosed = (s: ItemStatus) => s === "done" || s === "cancelled"

// ── Records ──

export type Link = { label: string; url: string }

export type ProductCounts = {
  open: number
  closed: number
  byStatus: Partial<Record<ItemStatus, number>>
  /** Open items only. */
  bySeverity: Partial<Record<Severity, number>>
  /** Open items only. */
  byType: Partial<Record<ItemType, number>>
  overdue: number
}

export type Product = {
  id: number
  /** 2–8 capitals/digits, e.g. PLN. Item refs are KEY-NUMBER. */
  key: string
  name: string
  description: string
  status: ProductStatus
  /** Sidebar heading the product sits under ("" = none). */
  group: string
  /** A Lucide icon name, "" for initials. */
  icon: string
  /** "#rrggbb" or "". */
  color: string
  version: string
  links: Link[]
  position: number
  created: number
  updated: number
  counts?: ProductCounts
}

export type ProductInput = Partial<Pick<Product, "key" | "name" | "description" | "status" | "group" | "icon" | "color" | "version" | "links">>

export type Checklist = { done: number; total: number }

export type Item = {
  id: number
  /** e.g. "PLN-12"; inbox items are "IN-3". */
  ref: string
  productId: number | null
  /** "IN" for the inbox. */
  productKey: string
  productName: string
  number: number
  type: ItemType
  title: string
  /** Markdown. Present on single-item reads and lists. */
  body?: string
  status: ItemStatus
  severity: Severity
  labels: string[]
  /** YYYY-MM-DD or "". */
  startDate: string
  due: string
  milestoneId: number | null
  milestone: string
  position: number
  /** "You" or an API token's name, e.g. "Claude". */
  createdBy: string
  created: number
  updated: number
  closedAt: number
  deletedAt?: number
  comments: number
  checklist: Checklist
}

export type ItemInput = {
  /** Product key; "" or "IN" = inbox. */
  product?: string
  type?: ItemType
  title?: string
  body?: string
  status?: ItemStatus
  severity?: Severity
  labels?: string[]
  startDate?: string
  due?: string
  /** Milestone id (as a string) or name; "" clears. */
  milestone?: string
  position?: number
  addLabels?: string[]
  removeLabels?: string[]
  appendBody?: string
}

export type Comment = { id: number; itemId: number; author: string; body: string; created: number; updated: number }

/**
 * action: created | updated | commented | deleted | restored | milestone | product.
 * detail for "updated": { field: [old, new] } — fields title, type, status, severity, startDate, due, labels, milestone, ref;
 * "body"/"description" map to [null, null] (changed, not shown).
 */
export type Activity = {
  id: number
  itemId: number | null
  itemRef?: string
  itemTitle?: string
  productKey?: string
  productName?: string
  actor: string
  action: string
  detail: Record<string, [unknown, unknown]>
  created: number
}

/** One item with its comment thread (oldest first) and activity (newest first). */
export type ItemDetail = Item & { thread: Comment[]; activity: Activity[] }

export type Milestone = {
  id: number
  productId: number
  productKey: string
  productName: string
  name: string
  description: string
  due: string
  status: "open" | "done"
  created: number
  updated: number
  open: number
  closed: number
}
export type MilestoneInput = Partial<Pick<Milestone, "name" | "description" | "due" | "status">> & { product?: string }

export type Label = { name: string; count: number; open: number }

export type ItemFilter = {
  product?: string
  /** Items of the products in this sidebar section (ignored with `product`). */
  section?: string
  status?: ItemStatus[]
  type?: ItemType[]
  severity?: Severity[]
  label?: string
  milestone?: string
  q?: string
  open?: boolean
  closed?: boolean
  dueFrom?: string
  dueTo?: string
  overdue?: boolean
  /** Include items of archived products (only matters without `product`). */
  archived?: boolean
  sort?: "position" | "updated" | "created" | "due" | "severity"
  limit?: number
  offset?: number
}
export type ItemList = { items: Item[]; total: number }

export type Overview = {
  today: string
  products: Product[]
  totals: { open: number; inProgress: number; critical: number; high: number; overdue: number; dueThisWeek: number; inbox: number; doneThisWeek: number }
  /** Open critical + high items, most severe first. */
  urgent: Item[]
  /** Open items due within 14 days or overdue, by date. */
  dueSoon: Item[]
  inProgress: Item[]
  recent: Activity[]
}

export type CalendarData = { items: Item[]; milestones: Milestone[] }
export type SearchResult = { products: Product[]; items: Item[] }

export type ApiToken = { id: string; name: string; hint: string; scope: "read" | "write"; created: number; lastUsed: number; expires: number }

export type HealthWarning = { id: string; message: string; section?: string }
export type Session = { authenticated: boolean; setupRequired: boolean; name?: string; version: string; warnings?: HealthWarning[] }
export type Account = { name: string; twoFactor: boolean; recoveryCodes: number; created: number; passwordSet: number }
export type Device = { id: string; device: string; ip: string; userAgent: string; created: number; lastSeen: number; current: boolean }

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.body = body
  }
}

/** The server couldn't be reached at all. */
export class Unreachable extends Error {
  constructor() {
    super("Can't reach Docket")
  }
}

/** Identifies this tab, so it can ignore change events from its own saves. Also the server's CSRF check. */
export const clientId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "X-Client-Id": clientId }
  const init: RequestInit = { method, headers, credentials: "same-origin" }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    headers["Content-Type"] = "application/json"
  }
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Unreachable()
  }
  if (res.status === 502 || res.status === 504) throw new Unreachable()
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith("/api/auth/")) {
      forgetShell()
      window.dispatchEvent(new Event("docket:signed-out"))
    }
    const msg = (data as { error?: string }).error ?? res.statusText
    throw new ApiError(res.status, msg.charAt(0).toUpperCase() + msg.slice(1), data)
  }
  return data as T
}

const enc = encodeURIComponent

function query(f: Record<string, unknown>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === "" || v === false) continue
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(","))
    } else p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ""
}

export const api = {
  session: () => request<Session>("GET", "/api/auth/session"),
  setup: (code: string, name: string, password: string) => request<{ token: string }>("POST", "/api/auth/setup", { code, name, password }),
  login: (password: string, code?: string) => request<{ token: string }>("POST", "/api/auth/login", { password, code: code ?? "" }),
  logout: () => request<void>("POST", "/api/auth/logout").finally(forgetShell),

  account: () => request<Account>("GET", "/api/account"),
  updateAccount: (changes: { name?: string }) => request<Account>("PATCH", "/api/account", changes),
  changePassword: (current: string, next: string) => request<void>("POST", "/api/account/password", { current, next }),
  startTwoFactor: (password: string) => request<{ secret: string; uri: string }>("POST", "/api/account/2fa/setup", { password }),
  enableTwoFactor: (code: string) => request<{ recoveryCodes: string[] }>("POST", "/api/account/2fa/enable", { code }),
  disableTwoFactor: (password: string) => request<void>("POST", "/api/account/2fa/disable", { password }),
  newRecoveryCodes: (password: string) => request<{ recoveryCodes: string[] }>("POST", "/api/account/recovery-codes", { password }),
  sessions: () => request<Device[]>("GET", "/api/sessions"),
  revokeSession: (id: string) => request<void>("DELETE", `/api/sessions/${enc(id)}`),
  revokeOtherSessions: () => request<void>("POST", "/api/sessions/revoke-others"),

  tokens: () => request<ApiToken[]>("GET", "/api/tokens"),
  /** days: 0 = never expires. The token string is only ever returned here. */
  createToken: (name: string, scope: "read" | "write", days: number, password: string) =>
    request<{ token: string; info: ApiToken }>("POST", "/api/tokens", { name, scope, days, password }),
  deleteToken: (id: string) => request<void>("DELETE", `/api/tokens/${enc(id)}`),

  overview: () => request<Overview>("GET", "/api/overview"),

  products: () => request<Product[]>("GET", "/api/products"),
  product: (key: string) => request<Product>("GET", `/api/products/${enc(key)}`),
  createProduct: (p: ProductInput) => request<Product>("POST", "/api/products", p),
  updateProduct: (key: string, p: ProductInput) => request<Product>("PATCH", `/api/products/${enc(key)}`, p),
  /** Deletes the product with all its items. `confirm` must equal the product's key. */
  deleteProduct: (key: string) => request<void>("DELETE", `/api/products/${enc(key)}?confirm=${enc(key)}`),
  /** keys: every product key in sidebar order. groups: key → group heading, for products whose group changes. */
  /** sections: every section heading in order (empty ones included); omit to leave them. */
  orderProducts: (keys: string[], groups?: Record<string, string>, sections?: string[]) =>
    request<Product[]>("POST", "/api/products/order", { keys, groups, sections }),
  /** Sidebar section headings, in order, empty ones included. */
  groups: () => request<string[]>("GET", "/api/groups"),
  createSection: (name: string) => request<string[]>("POST", "/api/sections", { name }),
  renameSection: (name: string, to: string) => request<string[]>("PATCH", `/api/sections/${enc(name)}`, { name: to }),
  deleteSection: (name: string) => request<string[]>("DELETE", `/api/sections/${enc(name)}`),

  items: (f: ItemFilter = {}) => request<ItemList>("GET", `/api/items${query(f)}`),
  item: (ref: string) => request<ItemDetail>("GET", `/api/items/${enc(ref)}`),
  createItem: (i: ItemInput) => request<Item>("POST", "/api/items", i),
  updateItem: (ref: string, i: ItemInput) => request<Item>("PATCH", `/api/items/${enc(ref)}`, i),
  /** Moves the item to the trash. */
  deleteItem: (ref: string) => request<void>("DELETE", `/api/items/${enc(ref)}`),
  restoreItem: (ref: string) => request<Item>("POST", `/api/items/${enc(ref)}/restore`),
  addComment: (ref: string, body: string) => request<Comment>("POST", `/api/items/${enc(ref)}/comments`, { body }),
  editComment: (id: number, body: string) => request<Comment>("PATCH", `/api/comments/${id}`, { body }),
  deleteComment: (id: number) => request<void>("DELETE", `/api/comments/${id}`),

  trash: () => request<ItemList>("GET", "/api/trash"),
  purgeItem: (ref: string) => request<void>("DELETE", `/api/trash/${enc(ref)}`),
  emptyTrash: () => request<void>("DELETE", "/api/trash"),

  /** product: a key, or omit for every product's milestones. */
  milestones: (product?: string) => request<Milestone[]>("GET", `/api/milestones${query({ product })}`),
  createMilestone: (m: MilestoneInput) => request<Milestone>("POST", "/api/milestones", m),
  updateMilestone: (id: number, m: MilestoneInput) => request<Milestone>("PATCH", `/api/milestones/${id}`, m),
  deleteMilestone: (id: number) => request<void>("DELETE", `/api/milestones/${id}`),

  labels: () => request<Label[]>("GET", "/api/labels"),
  /** product: a key to limit to one product. */
  activity: (opts: { product?: string; section?: string; before?: number; limit?: number } = {}) => request<Activity[]>("GET", `/api/activity${query(opts)}`),
  /** from/to: YYYY-MM-DD, inclusive. Items whose start..due span touches the range, and milestones due in it. */
  calendar: (from: string, to: string, product?: string) => request<CalendarData>("GET", `/api/calendar${query({ from, to, product })}`),
  search: (q: string) => request<SearchResult>("GET", `/api/search${query({ q })}`),
}
