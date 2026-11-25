import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLocation } from "react-router"
import { toast } from "sonner"

import { SeverityBadge } from "@/components/badges"
import { DateInput, LabelsEditor, OptionMenu, ProductMenu, severityOptions, statusOptions, typeOptions } from "@/components/pickers"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Kbd } from "@/components/ui/kbd"
import { invalidateWork, useItemSheet } from "@/hooks/use-data"
import { api, type ItemInput, type ItemStatus, type ItemType, type Severity } from "@/lib/api"
import { errorMessage } from "@/lib/format"
import { onUiEvent, openNewItem } from "@/lib/ui-events"

/** Whether a key press landed in something that takes text. */
export function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest("[role=dialog],[role=menu],[cmdk-root]"))
}

/** The product page in the address bar, if any: new items go there. */
function productHere(pathname: string) {
  const m = /^\/p\/([^/]+)/.exec(pathname)
  return m ? decodeURIComponent(m[1]) : ""
}

/** Quick create: press C anywhere, or a New item button. */
export function NewItemDialog() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [product, setProduct] = useState("")
  const [type, setType] = useState<ItemType>("task")
  const [severity, setSeverity] = useState<Severity>("medium")
  const [status, setStatus] = useState<ItemStatus>("backlog")
  const [due, setDue] = useState("")
  const [labels, setLabels] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const { pathname } = useLocation()
  const here = useRef(pathname)
  here.current = pathname
  const qc = useQueryClient()
  const { open: openItem } = useItemSheet()

  useEffect(
    () =>
      onUiEvent<ItemInput>("docket:new-item", (d = {}) => {
        setTitle(d.title ?? "")
        setBody(d.body ?? "")
        setProduct(d.product ?? productHere(here.current))
        setType(d.type ?? "task")
        setSeverity(d.severity ?? "medium")
        setStatus(d.status ?? (d.product || productHere(here.current) ? "todo" : "backlog"))
        setDue(d.due ?? "")
        setLabels(d.labels ?? [])
        setMore(!!d.body)
        setOpen(true)
      }),
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "c" || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return
      e.preventDefault()
      openNewItem()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const create = async (andOpen: boolean) => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      const item = await api.createItem({ title, body, product, type, severity, status, due, labels })
      invalidateWork(qc)
      setOpen(false)
      if (andOpen) openItem(item.ref)
      else toast.success(`Created ${item.ref}`, { action: { label: "Open", onClick: () => openItem(item.ref) } })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-4 sm:max-w-xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            New item
            <ProductMenu value={product} onChange={setProduct} />
          </DialogTitle>
          <DialogDescription className="sr-only">Add a feature, bug or task.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void create(false)
          }}
        >
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void create(true)
              }
            }}
            placeholder="Title"
            aria-label="Title"
            maxLength={300}
            className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground/70"
          />
          {more ? (
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Description (Markdown, - [ ] for a checklist)" className="min-h-28 text-sm" />
          ) : (
            <button type="button" className="justify-self-start text-sm text-muted-foreground hover:text-foreground" onClick={() => setMore(true)}>
              Add a description…
            </button>
          )}
          <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-surface p-1">
            <OptionMenu value={status} options={statusOptions} onChange={setStatus} label="Status" />
            <OptionMenu value={type} options={typeOptions} onChange={setType} label="Type" />
            <OptionMenu value={severity} options={severityOptions} onChange={setSeverity} label="Severity">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5">
                <SeverityBadge severity={severity} />
              </Button>
            </OptionMenu>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Due
              <DateInput value={due} onChange={setDue} />
            </label>
            <LabelsEditor value={labels} onChange={setLabels} />
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <span className="hidden text-xs text-muted-foreground sm:block">
              <Kbd>Enter</Kbd> create · <Kbd>⌘ Enter</Kbd> create and open
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || busy}>
                Create
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
