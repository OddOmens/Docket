import { useState } from "react"
import { cn } from "cn"
import { Check, ChevronDown, Plus } from "lucide-react"

import { LabelChip, ProductStatusDot, SeverityBars, StatusIcon, TypeIcon } from "@/components/badges"
import { InboxAvatar, ProductAvatar } from "@/components/product-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useLabels, useMilestones, useProducts } from "@/hooks/use-data"
import { ITEM_STATUSES, ITEM_TYPES, PRODUCT_STATUSES, SEVERITIES, type ItemStatus, type ItemType, type ProductStatus, type Severity } from "@/lib/api"
import { ITEM_STATUS, ITEM_TYPE, PRODUCT_STATUS, SEVERITY } from "@/lib/meta"

type Option<T extends string> = { value: T; label: string; icon?: React.ReactNode }

/** A dropdown of options; the trigger is the child, or a small outline button. */
export function OptionMenu<T extends string>({
  value,
  options,
  onChange,
  children,
  label,
  align = "start",
  disabled,
}: {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  children?: React.ReactNode
  label?: string
  align?: "start" | "end"
  disabled?: boolean
}) {
  const cur = options.find((o) => o.value === value)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children ?? (
          <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 px-1.5 font-normal" aria-label={label}>
            {cur?.icon}
            <span className="truncate">{cur?.label ?? "None"}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-44" onClick={(e) => e.stopPropagation()}>
        {label && <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{label}</DropdownMenuLabel>}
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => o.value !== value && onChange(o.value)}>
            {o.icon}
            <span className="truncate">{o.label}</span>
            {o.value === value && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const statusOptions: Option<ItemStatus>[] = ITEM_STATUSES.map((s) => ({ value: s, label: ITEM_STATUS[s].label, icon: <StatusIcon status={s} /> }))
export const severityOptions: Option<Severity>[] = [...SEVERITIES].reverse().map((s) => ({ value: s, label: SEVERITY[s].label, icon: <SeverityBars severity={s} /> }))
export const typeOptions: Option<ItemType>[] = ITEM_TYPES.map((t) => ({ value: t, label: ITEM_TYPE[t].label, icon: <TypeIcon type={t} /> }))
export const productStatusOptions: Option<ProductStatus>[] = PRODUCT_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS[s].label, icon: <ProductStatusDot status={s} className="mx-1 size-2" /> }))

/** Picks a product (by key) or the inbox (""). Archived products are listed last. */
export function ProductMenu({ value, onChange, children, allowInbox = true, only }: { value: string; onChange: (key: string) => void; children?: React.ReactNode; allowInbox?: boolean; only?: string[] }) {
  const { data: all = [] } = useProducts()
  const products = only ? all.filter((p) => only.includes(p.key)) : all
  const live = products.filter((p) => p.status !== "archived")
  const archived = products.filter((p) => p.status === "archived")
  const cur = products.find((p) => p.key === value)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {children ?? (
          <Button variant="ghost" size="sm" className="h-7 min-w-0 justify-start gap-1.5 px-1.5 font-normal">
            {cur ? <ProductAvatar name={cur.name} color={cur.color} icon={cur.icon} className="size-4 rounded text-[0.45rem]" /> : <InboxAvatar className="size-4 rounded" />}
            <span className="truncate">{cur?.name ?? "Inbox"}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-56" onClick={(e) => e.stopPropagation()}>
        {allowInbox && (
          <DropdownMenuItem onSelect={() => value !== "" && onChange("")}>
            <InboxAvatar className="size-5 rounded" /> Inbox
            {value === "" && <Check className="ml-auto" />}
          </DropdownMenuItem>
        )}
        {live.map((p) => (
          <DropdownMenuItem key={p.key} onSelect={() => p.key !== value && onChange(p.key)}>
            <ProductAvatar name={p.name} color={p.color} icon={p.icon} className="size-5 rounded text-[0.5rem]" />
            <span className="truncate">{p.name}</span>
            <span className="ml-auto pl-2 font-mono text-[0.65rem] text-muted-foreground">{p.key}</span>
            {p.key === value && <Check />}
          </DropdownMenuItem>
        ))}
        {archived.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Archived</DropdownMenuLabel>
            {archived.map((p) => (
              <DropdownMenuItem key={p.key} onSelect={() => p.key !== value && onChange(p.key)} className="text-muted-foreground">
                <ProductAvatar name={p.name} color={p.color} icon={p.icon} className="size-5 rounded text-[0.5rem] opacity-60" />
                <span className="truncate">{p.name}</span>
                {p.key === value && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Picks one of a product's milestones, or none. */
export function MilestoneMenu({ product, value, onChange }: { product: string; value: number | null; onChange: (id: string) => void }) {
  const { data = [] } = useMilestones(product, !!product && product !== "IN")
  const cur = data.find((m) => m.id === value)
  if (!product || product === "IN") return <span className="px-1.5 text-sm text-muted-foreground">Needs a product</span>
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("h-7 min-w-0 justify-start px-1.5 font-normal", !cur && "text-muted-foreground")}>
          <span className="truncate">{cur?.name ?? "None"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuItem onSelect={() => onChange("")}>
          None {value === null && <Check className="ml-auto" />}
        </DropdownMenuItem>
        {data.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => onChange(String(m.id))} className={cn(m.status === "done" && "text-muted-foreground")}>
            <span className="truncate">{m.name}</span>
            {m.due && <span className="ml-auto pl-2 text-xs text-muted-foreground">{m.due}</span>}
            {m.id === value && <Check />}
          </DropdownMenuItem>
        ))}
        {data.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No milestones yet. Add them on the product's Milestones tab.</div>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Edits a list of labels, suggesting ones already in use. */
export function LabelsEditor({ value, onChange }: { value: string[]; onChange: (labels: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const { data: all = [] } = useLabels()
  const clean = (s: string) => s.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-")
  const q = clean(text)
  const suggestions = all.filter((l) => !value.includes(l.name) && (!q || l.name.includes(q))).slice(0, 8)
  const add = (l: string) => {
    const v = clean(l)
    if (v && !value.includes(v)) onChange([...value, v])
    setText("")
  }
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1 px-1.5">
      {value.map((l) => (
        <LabelChip key={l} label={l} onRemove={() => onChange(value.filter((x) => x !== l))} />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Add label" className="text-muted-foreground">
            <Plus />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 gap-1 p-1.5">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (q) add(q)
            }}
          >
            <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a label…" className="h-8" />
          </form>
          <div className="grid max-h-56 overflow-y-auto">
            {q && !all.some((l) => l.name === q) && !value.includes(q) && (
              <button type="button" className="rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => add(q)}>
                Create <span className="font-medium">#{q}</span>
              </button>
            )}
            {suggestions.map((l) => (
              <button key={l.name} type="button" className="flex items-center rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => add(l.name)}>
                <span className="text-tag">#</span>
                {l.name}
                <span className="ml-auto text-xs text-muted-foreground">{l.open}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** A date field that saves "" when cleared. */
export function DateInput({ value, onChange, className, id }: { value: string; onChange: (v: string) => void; className?: string; id?: string }) {
  return (
    <input
      id={id}
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-7 rounded-md border border-transparent bg-transparent px-1.5 text-sm outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:[color-scheme:dark]",
        !value && "text-muted-foreground",
        className,
      )}
    />
  )
}

/** A compact multi-select filter button ("Severity: High, Critical"). */
export function FilterMenu<T extends string>({ label, options, value, onChange }: { label: string; options: Option<T>[]; value: T[]; onChange: (v: T[]) => void }) {
  const names = options.filter((o) => value.includes(o.value)).map((o) => o.label)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-7 gap-1 font-normal", value.length > 0 && "border-foreground/30 bg-accent")}>
          {label}
          {names.length > 0 && <span className="max-w-32 truncate text-muted-foreground">: {names.join(", ")}</span>}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {options.map((o) => {
          const on = value.includes(o.value)
          return (
            <DropdownMenuItem
              key={o.value}
              onSelect={(e) => {
                e.preventDefault()
                onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])
              }}
            >
              <span className={cn("grid size-4 place-items-center rounded-sm border", on && "border-primary bg-primary text-primary-foreground")}>{on && <Check className="size-3" />}</span>
              {o.icon}
              {o.label}
            </DropdownMenuItem>
          )
        })}
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
