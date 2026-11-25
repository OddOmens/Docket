import { useEffect, useState } from "react"
import { cn } from "cn"
import { Check, Plus, Trash2 } from "lucide-react"

import { IconPicker } from "@/components/icon-picker"
import { OptionMenu, productStatusOptions } from "@/components/pickers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useGroups } from "@/hooks/use-data"
import type { Link, ProductInput, ProductStatus } from "@/lib/api"
import { COLORS } from "@/lib/meta"

/** A key from a name: initials of several words, or the start of one. */
export function suggestKey(name: string) {
  const words = name.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
  let k = words.length >= 2 ? words.map((w) => w[0]).join("").slice(0, 4) : (words[0] ?? "").slice(0, 3)
  if (!/^[A-Z]/.test(k)) k = "P" + k
  if (k === "IN") k = "INX"
  return k.length < 2 ? "" : k.slice(0, 8)
}

export type ProductDraft = Required<Omit<ProductInput, "links">> & { links: Link[] }

export const emptyProduct: ProductDraft = { key: "", name: "", description: "", status: "active", group: "", icon: "", color: COLORS[0], version: "", links: [] }

/** The fields of a product, shared by the new-product dialog and a product's settings. */
export function ProductFields({ value, onChange, keyTouched, onKeyTouched, full }: { value: ProductDraft; onChange: (v: ProductDraft) => void; keyTouched?: boolean; onKeyTouched?: () => void; full?: boolean }) {
  const { data: groups = [] } = useGroups()
  const set = (p: Partial<ProductDraft>) => onChange({ ...value, ...p })
  useEffect(() => {
    if (!keyTouched && onKeyTouched) set({ key: suggestKey(value.name) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.name])
  const [groupOpen, setGroupOpen] = useState(false)
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div className="grid gap-1.5">
          <Label htmlFor="p-name">Name</Label>
          <Input id="p-name" autoFocus={!full} value={value.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder="e.g. Plinthio" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-key">Key</Label>
          <Input
            id="p-key"
            value={value.key}
            onChange={(e) => {
              onKeyTouched?.()
              set({ key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) })
            }}
            className="font-mono uppercase"
            placeholder="PLN"
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Items are numbered {value.key || "KEY"}-1, {value.key || "KEY"}-2 and so on.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Status</Label>
          <OptionMenu value={value.status as ProductStatus} options={productStatusOptions} onChange={(status) => set({ status })}>
            <Button type="button" variant="outline" className="justify-start font-normal">
              {productStatusOptions.find((o) => o.value === value.status)?.icon}
              {productStatusOptions.find((o) => o.value === value.status)?.label}
            </Button>
          </OptionMenu>
        </div>
        <div className="relative grid gap-1.5">
          <Label htmlFor="p-group">Section</Label>
          <Input
            id="p-group"
            value={value.group}
            onChange={(e) => set({ group: e.target.value })}
            onFocus={() => setGroupOpen(true)}
            onBlur={() => setTimeout(() => setGroupOpen(false), 150)}
            placeholder="None"
            autoComplete="off"
            maxLength={60}
          />
          {groupOpen && groups.filter((g) => g !== value.group && g.toLowerCase().includes(value.group.toLowerCase())).length > 0 && (
            <div className="absolute top-full z-50 mt-1 grid w-full rounded-md border bg-popover p-1 shadow-md">
              {groups
                .filter((g) => g !== value.group && g.toLowerCase().includes(value.group.toLowerCase()))
                .map((g) => (
                  <button key={g} type="button" className="rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onMouseDown={(e) => e.preventDefault()} onClick={() => (set({ group: g }), setGroupOpen(false))}>
                    {g}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label>Icon and colour</Label>
        <div className="flex flex-wrap items-center gap-3">
          <IconPicker value={value.icon} onChange={(icon) => set({ icon })} name={value.name} color={value.color} />
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => set({ color: c })}
                className={cn("grid size-6 place-items-center rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring", value.color === c && "ring-2 ring-foreground/40")}
                style={{ background: c }}
              >
                {value.color === c && <Check className="size-3.5 text-white" />}
              </button>
            ))}
          </div>
        </div>
      </div>
      {full && (
        <div className="grid gap-1.5 sm:max-w-48">
          <Label htmlFor="p-version">Current version</Label>
          <Input id="p-version" value={value.version} onChange={(e) => set({ version: e.target.value })} placeholder="1.4.0" maxLength={40} />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="p-desc">Description</Label>
        <Textarea id="p-desc" value={value.description} onChange={(e) => set({ description: e.target.value })} placeholder="What it is, where it runs, anything worth remembering (Markdown)" className={cn("text-sm", full ? "min-h-40" : "min-h-20")} />
      </div>
      {full && <LinksEditor links={value.links} onChange={(links) => set({ links })} />}
    </div>
  )
}

function LinksEditor({ links, onChange }: { links: Link[]; onChange: (l: Link[]) => void }) {
  const edit = (i: number, p: Partial<Link>) => onChange(links.map((l, j) => (j === i ? { ...l, ...p } : l)))
  return (
    <div className="grid gap-1.5">
      <Label>Links</Label>
      <div className="grid gap-2">
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <Input value={l.label} onChange={(e) => edit(i, { label: e.target.value })} placeholder="Repo" className="w-32 shrink-0" />
            <Input value={l.url} onChange={(e) => edit(i, { url: e.target.value })} placeholder="https://…" type="url" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove link" onClick={() => onChange(links.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={links.length >= 12} onClick={() => onChange([...links, { label: "", url: "" }])}>
          <Plus /> Add link
        </Button>
      </div>
    </div>
  )
}
