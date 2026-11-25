import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { cn } from "cn"
import { Archive, ArchiveRestore, Check, ChevronRight, Diamond, ExternalLink, KanbanSquare, LayoutDashboard, List, Pencil, Plus, Settings2, Trash2 } from "lucide-react"
import { Link, Navigate, NavLink, useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { ProductStatusBadge, SeverityBadge, TypeIcon } from "@/components/badges"
import { useDialogs } from "@/components/dialogs"
import { ItemList } from "@/components/item-list"
import { Markdown } from "@/components/markdown"
import { Page } from "@/components/page-header"
import { DateInput } from "@/components/pickers"
import { ProductAvatar } from "@/components/product-avatar"
import { ProductFields, type ProductDraft } from "@/components/product-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { invalidateWork, useItems, useMilestones, useProduct } from "@/hooks/use-data"
import { ApiError, api, ITEM_TYPES, SEVERITIES, type Milestone, type Product } from "@/lib/api"
import { errorMessage, formatDue } from "@/lib/format"
import { ITEM_TYPE } from "@/lib/meta"
import { BoardScreen } from "@/pages/board"
import { ActivityFeed } from "@/pages/home"
import { ItemsScreen } from "@/pages/items"

const TABS = [
  { id: "", label: "Overview", icon: LayoutDashboard },
  { id: "board", label: "Board", icon: KanbanSquare },
  { id: "list", label: "List", icon: List },
  { id: "milestones", label: "Milestones", icon: Diamond },
  { id: "settings", label: "Settings", icon: Settings2 },
]

export default function ProductPage() {
  const { key = "", tab = "" } = useParams()
  const { data: p, error, isLoading } = useProduct(key)
  if (error instanceof ApiError && error.status === 404) return <Navigate to="/" replace />
  if (!TABS.some((t) => t.id === tab)) return <Navigate to={`/p/${encodeURIComponent(key)}`} replace />
  const base = `/p/${encodeURIComponent(key)}`
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b px-3 pt-3 md:px-5 md:pt-4">
        <div className="flex items-center gap-3">
          {p ? <ProductAvatar name={p.name} color={p.color} icon={p.icon} className="size-8 rounded-lg text-[0.65rem]" /> : <Skeleton className="size-8 rounded-lg" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight">{p?.name ?? (isLoading ? "" : key)}</h1>
              {p && <ProductStatusBadge status={p.status} />}
              {p?.version && <span className="font-mono text-xs text-muted-foreground max-sm:hidden">v{p.version.replace(/^v/, "")}</span>}
            </div>
            <div className="font-mono text-[0.6875rem] text-muted-foreground">{p?.key}</div>
          </div>
        </div>
        <nav className="-mb-px mt-2 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <NavLink
              key={t.id}
              to={t.id ? `${base}/${t.id}` : base}
              end
              className={({ isActive }) =>
                cn(
                  "flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2 text-sm text-muted-foreground transition-colors hover:text-foreground [&>svg]:size-3.5 pointer-coarse:h-11",
                  isActive && "border-foreground font-medium text-foreground",
                )
              }
            >
              <t.icon /> {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1">
        {!p ? (
          <div className="p-6">
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : tab === "" ? (
          <Overview p={p} />
        ) : tab === "board" ? (
          <BoardScreen product={p.key} header={false} />
        ) : tab === "list" ? (
          <ItemsScreen product={p.key} header={false} />
        ) : tab === "milestones" ? (
          <Milestones p={p} />
        ) : (
          <SettingsTab p={p} />
        )}
      </div>
    </div>
  )
}

function Overview({ p }: { p: Product }) {
  const c = p.counts
  const { data: milestones = [] } = useMilestones(p.key)
  const { data: activity, isLoading } = useQuery({ queryKey: ["activity", p.key], queryFn: () => api.activity({ product: p.key, limit: 15 }) })
  const { data: urgent } = useItems({ product: p.key, open: true, severity: ["critical", "high"], sort: "severity", limit: 8 })
  const base = `/p/${encodeURIComponent(p.key)}`
  return (
    <Page>
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 md:grid-cols-[minmax(0,1fr)_18rem] md:px-6">
        <div className="grid min-w-0 content-start gap-6">
          <section className="rounded-xl border bg-card p-4">
            {p.description ? <Markdown text={p.description} /> : (
              <p className="text-sm text-muted-foreground">
                No description yet. <Link to={`${base}/settings`} className="text-foreground underline-offset-4 hover:underline">Add one</Link> with what it is, where it runs and how it's released.
              </p>
            )}
            {p.links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                {p.links.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs hover:bg-accent">
                    <ExternalLink className="size-3" /> {l.label || new URL(l.url).hostname}
                  </a>
                ))}
              </div>
            )}
          </section>

          {!!urgent?.items.length && (
            <section>
              <h2 className="mb-2.5 text-sm font-semibold">Needs attention</h2>
              <ItemList items={urgent.items} showProduct={false} />
            </section>
          )}

          <section>
            <h2 className="mb-2.5 text-sm font-semibold">Recent activity</h2>
            <ActivityFeed entries={activity} loading={isLoading} showProduct={false} />
          </section>
        </div>

        <aside className="grid content-start gap-4">
          <Box title="Summary">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <Count label="Open" n={c?.open ?? 0} to={`${base}/list`} />
              <Count label="In progress" n={(c?.byStatus.in_progress ?? 0) + (c?.byStatus.review ?? 0)} to={`${base}/board`} />
              <Count label="Done" n={c?.byStatus.done ?? 0} to={`${base}/list?status=done`} />
              <Count label="Overdue" n={c?.overdue ?? 0} to={`${base}/list?overdue=1`} alert />
            </div>
            {!!c?.open && (
              <div className="flex flex-wrap gap-1.5 border-t pt-2.5">
                {[...SEVERITIES].reverse().map((s) =>
                  c.bySeverity[s] ? (
                    <Link key={s} to={`${base}/list?severity=${s}`} className="inline-flex items-center gap-1 text-xs">
                      <SeverityBadge severity={s} /> <span className="tabular-nums text-muted-foreground">{c.bySeverity[s]}</span>
                    </Link>
                  ) : null,
                )}
                {ITEM_TYPES.filter((t) => c.byType[t]).map((t) => (
                  <Link key={t} to={`${base}/list?type=${t}`} className="inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-xs hover:bg-accent">
                    <TypeIcon type={t} className="size-3" /> {ITEM_TYPE[t].label} <span className="tabular-nums text-muted-foreground">{c.byType[t]}</span>
                  </Link>
                ))}
              </div>
            )}
          </Box>
          {milestones.some((m) => m.status === "open") && (
            <Box title="Milestones" action={<Link to={`${base}/milestones`} className="text-xs text-muted-foreground hover:text-foreground">All</Link>}>
              {milestones.filter((m) => m.status === "open").slice(0, 5).map((m) => (
                <MilestoneProgress key={m.id} m={m} />
              ))}
            </Box>
          )}
        </aside>
      </div>
    </Page>
  )
}

export function Box({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 rounded-xl border bg-card p-3">
      <div className="flex items-center">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </section>
  )
}

export function Count({ label, n, to, alert }: { label: string; n: number; to: string; alert?: boolean }) {
  return (
    <Link to={to} className="flex items-baseline justify-between rounded px-1 py-0.5 hover:bg-accent/60">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", alert && n > 0 && "text-red-600 dark:text-red-400")}>{n}</span>
    </Link>
  )
}

function MilestoneProgress({ m }: { m: Milestone }) {
  const total = m.open + m.closed
  const pct = total ? Math.round((m.closed / total) * 100) : 0
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2 text-sm">
        <Diamond className={cn("size-3 shrink-0", m.status === "done" ? "fill-green-600 text-green-600" : "text-brand")} />
        <span className="min-w-0 flex-1 truncate">{m.name}</span>
        {m.due && <span className="text-xs text-muted-foreground">{formatDue(m.due)}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-green-600/80" style={{ width: `${pct}%` }} />
        </span>
        <span className="w-16 text-right text-[0.6875rem] tabular-nums text-muted-foreground">
          {m.closed}/{total}
        </span>
      </div>
    </div>
  )
}

function Milestones({ p }: { p: Product }) {
  const { data = [], isLoading } = useMilestones(p.key)
  const [editing, setEditing] = useState<Milestone | "new" | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const qc = useQueryClient()
  const { confirm } = useDialogs()
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      invalidateWork(qc)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <Page>
      <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-6 md:px-6">
        <div className="flex items-center">
          <p className="text-sm text-muted-foreground">Releases and goals. Give items a milestone to see how close each one is.</p>
          <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => setEditing("new")}>
            <Plus /> Milestone
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : data.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">No milestones yet.</p>
        ) : (
          <div className="divide-y rounded-xl border bg-card">
            {data.map((m) => (
              <div key={m.id}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button type="button" aria-label={openId === m.id ? "Hide items" : "Show items"} onClick={() => setOpenId(openId === m.id ? null : m.id)} className="grid size-6 place-items-center rounded hover:bg-accent">
                    <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", openId === m.id && "rotate-90")} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <MilestoneProgress m={m} />
                    {m.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.status === "done" ? "Reopen" : "Mark done"}
                    title={m.status === "done" ? "Reopen" : "Mark done"}
                    onClick={() => void run(() => api.updateMilestone(m.id, { status: m.status === "done" ? "open" : "done" }))}
                  >
                    <Check className={m.status === "done" ? "text-green-600" : ""} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Edit milestone" onClick={() => setEditing(m)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete milestone"
                    onClick={async () => {
                      if (await confirm({ title: `Delete ${m.name}?`, description: "Its items stay, without a milestone.", confirm: "Delete", destructive: true })) void run(() => api.deleteMilestone(m.id))
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {openId === m.id && <MilestoneItems product={p.key} id={m.id} />}
              </div>
            ))}
          </div>
        )}
      </div>
      <MilestoneDialog product={p.key} value={editing} onClose={() => setEditing(null)} />
    </Page>
  )
}

function MilestoneItems({ product, id }: { product: string; id: number }) {
  const { data } = useItems({ product, milestone: String(id), sort: "position" })
  return (
    <div className="border-t bg-surface/50 px-2 py-2">
      <ItemList items={data?.items ?? []} group="status" showProduct={false} empty={<p className="px-2 py-3 text-sm text-muted-foreground">No items in this milestone yet. Set it from an item's Milestone field.</p>} />
    </div>
  )
}

function MilestoneDialog({ product, value, onClose }: { product: string; value: Milestone | "new" | null; onClose: () => void }) {
  const [name, setName] = useState("")
  const [due, setDue] = useState("")
  const [description, setDescription] = useState("")
  const qc = useQueryClient()
  useEffect(() => {
    if (!value) return
    setName(value === "new" ? "" : value.name)
    setDue(value === "new" ? "" : value.due)
    setDescription(value === "new" ? "" : value.description)
  }, [value])
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{value === "new" ? "New milestone" : "Edit milestone"}</DialogTitle>
          <DialogDescription>A release or goal, like 1.5.0 or Public beta.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              if (value === "new") await api.createMilestone({ product, name, due, description })
              else if (value) await api.updateMilestone(value.id, { name, due, description })
              invalidateWork(qc)
              onClose()
            } catch (err) {
              toast.error(errorMessage(err))
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="ms-name">Name</Label>
            <Input id="ms-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ms-due">Target date</Label>
            <DateInput id="ms-due" value={due} onChange={setDue} className="h-8 w-fit border-input" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ms-desc">Notes</Label>
            <Textarea id="ms-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20 text-sm" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SettingsTab({ p }: { p: Product }) {
  const toDraft = (x: Product): ProductDraft => ({ key: x.key, name: x.name, description: x.description, status: x.status, group: x.group, icon: x.icon, color: x.color, version: x.version, links: x.links })
  const [draft, setDraft] = useState<ProductDraft>(() => toDraft(p))
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [typed, setTyped] = useState("")
  const qc = useQueryClient()
  const navigate = useNavigate()
  useEffect(() => setDraft(toDraft(p)), [p])
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(p))
  const save = async (input: Partial<ProductDraft>) => {
    setBusy(true)
    try {
      const next = await api.updateProduct(p.key, input)
      invalidateWork(qc)
      toast.success("Saved")
      if (next.key !== p.key) navigate(`/p/${encodeURIComponent(next.key)}/settings`, { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Page>
      <div className="mx-auto grid w-full max-w-2xl gap-8 px-4 py-6 md:px-6">
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            void save({ ...draft, links: draft.links.filter((l) => l.url.trim()) })
          }}
        >
          <ProductFields value={draft} onChange={setDraft} full />
          <div className="flex gap-2">
            <Button type="submit" disabled={!dirty || busy || !draft.name.trim()}>
              Save changes
            </Button>
            {dirty && (
              <Button type="button" variant="ghost" onClick={() => setDraft(toDraft(p))}>
                Discard
              </Button>
            )}
          </div>
        </form>
        <section className="grid gap-3 border-t pt-6">
          <h2 className="text-sm font-semibold">{p.status === "archived" ? "Archived" : "Archive"}</h2>
          <p className="text-sm text-muted-foreground">
            {p.status === "archived"
              ? "This product is hidden from Home, the board and the calendar. Its items are kept."
              : "Archiving hides the product and its items from Home, the board and the calendar. Nothing is deleted."}
          </p>
          <Button variant="outline" className="justify-self-start" onClick={() => void save({ status: p.status === "archived" ? "active" : "archived" })}>
            {p.status === "archived" ? (
              <>
                <ArchiveRestore /> Unarchive
              </>
            ) : (
              <>
                <Archive /> Archive product
              </>
            )}
          </Button>
        </section>
        <section className="grid gap-3 border-t pt-6">
          <h2 className="text-sm font-semibold text-destructive">Delete</h2>
          <p className="text-sm text-muted-foreground">Deletes the product with every item, comment and milestone in it, for good. Archive it instead to keep the history.</p>
          <Button variant="outline" className="justify-self-start border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => (setTyped(""), setDeleting(true))}>
            <Trash2 /> Delete product…
          </Button>
        </section>
      </div>
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {p.name}?</DialogTitle>
            <DialogDescription>
              {p.counts ? `${p.counts.open + p.counts.closed} items` : "Its items"} and all their comments go too. This can't be undone. Type <span className="font-mono font-semibold text-foreground">{p.key}</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} className="font-mono" aria-label="Product key" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={typed !== p.key}
              onClick={async () => {
                try {
                  await api.deleteProduct(p.key)
                  setDeleting(false)
                  qc.removeQueries({ queryKey: ["product", p.key] })
                  invalidateWork(qc)
                  navigate("/", { replace: true })
                  toast.success(`Deleted ${p.name}`)
                } catch (e) {
                  toast.error(errorMessage(e))
                }
              }}
            >
              Delete for good
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
