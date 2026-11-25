import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "cn"
import { Check, Eye, Link2, ListChecks, Loader2, MoreHorizontal, Pencil, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { useDialogs } from "@/components/dialogs"
import { Markdown } from "@/components/markdown"
import { DateInput, LabelsEditor, MilestoneMenu, OptionMenu, ProductMenu, severityOptions, statusOptions, typeOptions } from "@/components/pickers"
import { SeverityBadge } from "@/components/badges"
import { InboxAvatar, ProductAvatar } from "@/components/product-avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { invalidateWork, useItem, useItemSheet, useProducts, useUpdateItem } from "@/hooks/use-data"
import { api, type Activity, type Comment, type ItemDetail, type ItemInput } from "@/lib/api"
import { errorMessage, formatDate, relativeTime } from "@/lib/format"
import { toggleTask } from "@/lib/markdown"
import { FIELD_LABEL, valueLabel } from "@/lib/meta"

/** The item named by ?item=REF, in a sheet over whatever screen is open. */
export function ItemSheet() {
  const { current, open } = useItemSheet()
  return (
    <Sheet open={!!current} onOpenChange={(o) => !o && open(null)}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none md:data-[side=right]:w-[min(56rem,calc(100vw-4rem))] md:rounded-l-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {current && <ItemPanel key={current} ref_={current} />}
      </SheetContent>
    </Sheet>
  )
}

function ItemPanel({ ref_ }: { ref_: string }) {
  const { data: item, error, isLoading } = useItem(ref_)
  const { open } = useItemSheet()
  if (isLoading)
    return (
      <div className="grid h-full place-items-center">
        <SheetTitle className="sr-only">Loading</SheetTitle>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  if (!item)
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <SheetTitle className="text-base">Can't open {ref_}</SheetTitle>
          <SheetDescription className="mt-1">{error ? errorMessage(error) : "It may have been deleted or moved."}</SheetDescription>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => open(null)}>
            Close
          </Button>
        </div>
      </div>
    )
  return <ItemEditor item={item} />
}

function ItemEditor({ item }: { item: ItemDetail }) {
  const update = useUpdateItem()
  const qc = useQueryClient()
  const { open } = useItemSheet()
  const { confirm } = useDialogs()
  const { data: products = [] } = useProducts()
  const product = products.find((p) => p.key === item.productKey)
  const trashed = !!item.deletedAt

  const save = (input: ItemInput, after?: () => void) =>
    update.mutate(
      { ref: item.ref, input },
      {
        onSuccess: (next) => {
          qc.setQueryData(["item", next.ref], (old: ItemDetail | undefined) => (old ? { ...old, ...next } : old))
          if (next.ref !== item.ref) {
            toast.success(`Moved to ${next.productName} as ${next.ref}`)
            open(next.ref, true)
          }
          after?.()
        },
      },
    )

  const remove = async () => {
    try {
      await api.deleteItem(item.ref)
      invalidateWork(qc)
      open(null)
      toast.success(`${item.ref} moved to the trash`, {
        action: { label: "Undo", onClick: () => void api.restoreItem(item.ref).then(() => invalidateWork(qc)) },
      })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-4">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          {product ? <ProductAvatar name={product.name} color={product.color} icon={product.icon} className="size-5 rounded text-[0.5rem]" /> : <InboxAvatar className="size-5 rounded" />}
          <span className="truncate">{item.productName}</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-mono text-foreground">{item.ref}</span>
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy link"
            onClick={() => {
              const url = `${location.origin}${location.pathname}?item=${encodeURIComponent(item.ref)}`
              void navigator.clipboard?.writeText(url).then(() => toast.success("Link copied"))
            }}
          >
            <Link2 />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(item.ref).then(() => toast.success("Copied"))}>Copy {item.ref}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(`${item.ref} ${item.title}`).then(() => toast.success("Copied"))}>Copy ref and title</DropdownMenuItem>
              <DropdownMenuSeparator />
              {trashed ? (
                <DropdownMenuItem onSelect={() => void api.restoreItem(item.ref).then(() => invalidateWork(qc), (e) => toast.error(errorMessage(e)))}>Restore from trash</DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={async () => {
                    if (await confirm({ title: `Delete ${item.ref}?`, description: "It goes to the trash, where it can be restored for 30 days.", confirm: "Delete", destructive: true })) void remove()
                  }}
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => open(null)}>
            <X />
          </Button>
        </span>
      </header>
      {trashed && <div className="border-b bg-(--callout-warning-bg) px-4 py-2 text-sm text-(--callout-warning-fg)">This item is in the trash. Restore it to change it.</div>}
      <div className="min-h-0 flex-1 overflow-y-auto max-md:pb-(--sab)">
        <div className="grid min-h-full md:grid-cols-[minmax(0,1fr)_15.5rem]">
          <div className="min-w-0 px-4 pt-4 pb-10 md:px-6 md:pt-5">
            <SheetTitle className="sr-only">{item.title}</SheetTitle>
            <SheetDescription className="sr-only">
              {item.ref} in {item.productName}
            </SheetDescription>
            <TitleField value={item.title} disabled={trashed} onSave={(title) => save({ title })} />
            <div className="mt-4 md:hidden">
              <Properties item={item} save={save} disabled={trashed} />
            </div>
            <BodyField item={item} disabled={trashed} onSave={(body) => save({ body })} />
            <Thread item={item} disabled={trashed} />
          </div>
          <aside className="hidden border-l bg-surface/60 px-3 py-5 md:block">
            <Properties item={item} save={save} disabled={trashed} />
          </aside>
        </div>
      </div>
    </div>
  )
}

function TitleField({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled?: boolean }) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setText(value), [value])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [text])
  const commit = () => {
    const t = text.replace(/\s+/g, " ").trim()
    if (!t) return setText(value)
    if (t !== value) onSave(t)
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      value={text}
      disabled={disabled}
      aria-label="Title"
      onChange={(e) => setText(e.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === "Escape") {
          setText(value)
          e.stopPropagation()
        }
      }}
      className="w-full resize-none overflow-hidden rounded-md bg-transparent text-xl leading-snug font-semibold tracking-[-0.01em] outline-none placeholder:text-muted-foreground focus-visible:bg-accent/40 disabled:opacity-100"
    />
  )
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-8 grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-1 text-sm">
      <span className="text-[0.8125rem] text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Properties({ item, save, disabled }: { item: ItemDetail; save: (i: ItemInput) => void; disabled?: boolean }) {
  return (
    <div className={cn("grid gap-0.5", disabled && "pointer-events-none opacity-60")}>
      <Prop label="Status">
        <OptionMenu value={item.status} options={statusOptions} onChange={(status) => save({ status })} label="Status" />
      </Prop>
      <Prop label="Severity">
        <OptionMenu value={item.severity} options={severityOptions} onChange={(severity) => save({ severity })} label="Severity">
          <Button variant="ghost" size="sm" className="h-7 justify-start px-1.5">
            <SeverityBadge severity={item.severity} />
          </Button>
        </OptionMenu>
      </Prop>
      <Prop label="Type">
        <OptionMenu value={item.type} options={typeOptions} onChange={(type) => save({ type })} label="Type" />
      </Prop>
      <Prop label="Product">
        <ProductMenu value={item.productKey === "IN" ? "" : item.productKey} onChange={(product) => save({ product })} />
      </Prop>
      <Prop label="Milestone">
        <MilestoneMenu product={item.productKey} value={item.milestoneId} onChange={(milestone) => save({ milestone })} />
      </Prop>
      <Prop label="Labels">
        <LabelsEditor value={item.labels} onChange={(labels) => save({ labels })} />
      </Prop>
      <Prop label="Start">
        <DateInput value={item.startDate} onChange={(startDate) => save({ startDate })} />
      </Prop>
      <Prop label="Due">
        <DateInput value={item.due} onChange={(due) => save({ due })} />
      </Prop>
      <div className="mt-3 grid gap-1 border-t pt-3 text-xs text-muted-foreground">
        <span>
          Created {relativeTime(item.created * 1000)}
          {item.createdBy && ` by ${item.createdBy}`}
        </span>
        <span>Updated {relativeTime(item.updated * 1000)}</span>
        {item.closedAt > 0 && <span>Closed {relativeTime(item.closedAt * 1000)}</span>}
      </div>
    </div>
  )
}

/** The description: Markdown, edited as text, saved as you pause or leave the box. */
function BodyField({ item, onSave, disabled }: { item: ItemDetail; onSave: (body: string) => void; disabled?: boolean }) {
  const saved = item.body ?? ""
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(saved)
  const dirty = useRef(false)
  useEffect(() => {
    if (!dirty.current) setText(saved)
  }, [saved])
  useEffect(() => {
    if (!editing || !dirty.current) return
    const t = setTimeout(() => {
      dirty.current = false
      if (text !== saved) onSave(text)
    }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, editing])
  const finish = () => {
    if (dirty.current && text !== saved) onSave(text)
    dirty.current = false
    setEditing(false)
  }
  const { done, total } = item.checklist
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Description</h3>
        {total > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ListChecks className="size-3.5" /> {done}/{total}
            <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-green-600" style={{ width: `${(done / total) * 100}%` }} />
            </span>
          </span>
        )}
        {!disabled && (
          <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={() => (editing ? finish() : setEditing(true))}>
            {editing ? (
              <>
                <Eye /> Preview
              </>
            ) : (
              <>
                <Pencil /> Edit
              </>
            )}
          </Button>
        )}
      </div>
      {editing ? (
        <Textarea
          autoFocus
          value={text}
          onChange={(e) => {
            dirty.current = true
            setText(e.target.value)
          }}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation()
              finish()
            }
          }}
          placeholder={"Markdown. Use - [ ] for a checklist."}
          className="min-h-56 font-mono text-[0.8125rem] leading-relaxed"
        />
      ) : saved ? (
        <div className="rounded-lg px-0.5" onDoubleClick={() => !disabled && setEditing(true)}>
          <Markdown text={saved} onToggleTask={disabled ? undefined : (n) => onSave(toggleTask(saved, n))} />
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setEditing(true)}
          className="w-full rounded-lg border border-dashed px-3 py-6 text-left text-sm text-muted-foreground hover:bg-accent/50"
        >
          Add a description, steps to reproduce, or a checklist…
        </button>
      )}
    </section>
  )
}

/** Comments and changes, oldest first, with a box for a new comment. */
function Thread({ item, disabled }: { item: ItemDetail; disabled?: boolean }) {
  const qc = useQueryClient()
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const entries: ({ kind: "c"; at: number; c: Comment } | { kind: "a"; at: number; a: Activity })[] = [
    ...item.thread.map((c) => ({ kind: "c" as const, at: c.created, c })),
    ...item.activity.filter((a) => a.action !== "commented").map((a) => ({ kind: "a" as const, at: a.created, a })),
  ].sort((x, y) => x.at - y.at || (x.kind === "a" ? (x.a.id ?? 0) : 0) - (y.kind === "a" ? (y.a.id ?? 0) : 0))

  const post = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      await api.addComment(item.ref, text)
      setText("")
      invalidateWork(qc)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8">
      <h3 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Activity</h3>
      <ol className="grid gap-3">
        {entries.map((e) => (e.kind === "c" ? <CommentEntry key={`c${e.c.id}`} c={e.c} disabled={disabled} /> : <ActivityEntry key={`a${e.a.id}`} a={e.a} />))}
      </ol>
      {!disabled && (
        <form
          className="mt-4 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void post()
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void post()
              }
            }}
            placeholder="Leave a comment (Markdown)…"
            className="min-h-20 text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground max-sm:hidden">⌘Enter to send</span>
            <Button type="submit" size="sm" disabled={busy || !text.trim()}>
              Comment
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

function Avatar({ name }: { name: string }) {
  const bot = name !== "You"
  return (
    <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[0.6rem] font-semibold", bot ? "bg-brand-soft text-brand" : "bg-foreground text-background")}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function CommentEntry({ c, disabled }: { c: Comment; disabled?: boolean }) {
  const qc = useQueryClient()
  const { confirm } = useDialogs()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(c.body)
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      invalidateWork(qc)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <li className="flex gap-2.5">
      <Avatar name={c.author} />
      <div className="group min-w-0 flex-1 rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
          <span className="font-medium">{c.author}</span>
          <span className="text-muted-foreground" title={new Date(c.created * 1000).toLocaleString()}>
            {relativeTime(c.created * 1000)}
            {c.updated > c.created + 5 && " · edited"}
          </span>
          {!disabled && !editing && (
            <span className="ml-auto flex opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100">
              <Button variant="ghost" size="icon-xs" aria-label="Edit comment" onClick={() => setEditing(true)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete comment"
                onClick={async () => {
                  if (await confirm({ title: "Delete this comment?", confirm: "Delete", destructive: true })) void run(() => api.deleteComment(c.id))
                }}
              >
                <Trash2 />
              </Button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="grid gap-2 p-2">
            <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} className="min-h-20 text-sm" />
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => (setText(c.body), setEditing(false))}>
                Cancel
              </Button>
              <Button size="sm" disabled={!text.trim()} onClick={() => void run(() => api.editComment(c.id, text)).then(() => setEditing(false))}>
                <Check /> Save
              </Button>
            </div>
          </div>
        ) : (
          <Markdown text={c.body} className="px-3 py-2" />
        )}
      </div>
    </li>
  )
}

/** One change, in words: "Claude changed status from To do to In progress". */
export function describeActivity(a: Activity, subject = "this"): string {
  switch (a.action) {
    case "created":
      return `created ${subject}`
    case "commented":
      return subject === "this" ? "commented" : `commented on ${subject}`
    case "deleted":
      return `moved ${subject} to the trash`
    case "restored":
      return `restored ${subject}`
    case "milestone": {
      const v = a.detail?.created?.[1]
      return v ? `added milestone ${v}` : "changed a milestone"
    }
    case "product": {
      const v = a.detail?.created?.[1]
      if (v) return `added the product ${v}`
      break
    }
  }
  const parts = Object.entries(a.detail ?? {}).map(([field, [from, to]]) => {
    const name = FIELD_LABEL[field] ?? field
    if (field === "body" || field === "description") return `edited the ${name}`
    if (field === "ref") return `moved ${subject === "this" ? "this" : "it"} from ${from} to ${to}`
    if (field === "title") return `renamed ${subject} to “${to}”`
    if (field === "labels") {
      const was = (from as string[]) ?? []
      const now = (to as string[]) ?? []
      const added = now.filter((l) => !was.includes(l))
      const removed = was.filter((l) => !now.includes(l))
      return [added.length && `added ${added.map((l) => "#" + l).join(", ")}`, removed.length && `removed ${removed.map((l) => "#" + l).join(", ")}`].filter(Boolean).join(" and ")
    }
    if (field === "due" || field === "startDate") return to ? `set the ${name} to ${formatDate(String(to))}` : `cleared the ${name}`
    if (!from) return `set ${name} to ${valueLabel(field, to)}`
    return `changed ${name} from ${valueLabel(field, from)} to ${valueLabel(field, to)}`
  })
  const text = parts.length ? parts.join(", ") : a.action
  return subject === "this" || /\b(renamed|moved)\b/.test(text) ? text : `${text} on ${subject}`
}

function ActivityEntry({ a }: { a: Activity }) {
  return (
    <li className="flex items-start gap-2.5 pl-1 text-[0.8125rem] text-muted-foreground">
      <span className="mt-1.5 ml-1.5 size-2 shrink-0 rounded-full bg-border" />
      <span className="min-w-0 flex-1">
        <span className="font-medium text-foreground">{a.actor}</span> {describeActivity(a)}
        <span className="ml-1.5 text-xs" title={new Date(a.created * 1000).toLocaleString()}>
          · {relativeTime(a.created * 1000)}
        </span>
      </span>
    </li>
  )
}
