import { useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "cn"

import { StatusIcon } from "@/components/badges"
import { ItemRow } from "@/components/item-row"
import { InboxAvatar, ProductAvatar } from "@/components/product-avatar"
import { useProducts } from "@/hooks/use-data"
import { ITEM_STATUSES, type Item } from "@/lib/api"
import { ITEM_STATUS } from "@/lib/meta"

export type Grouping = "none" | "status" | "product"

/** Items as rows, optionally in collapsible groups. */
export function ItemList({ items, group = "none", showProduct = true, empty }: { items: Item[]; group?: Grouping; showProduct?: boolean; empty?: React.ReactNode }) {
  const { data: products = [] } = useProducts()
  const byKey = useMemo(() => new Map(products.map((p) => [p.key, p])), [products])
  const [closed, setClosed] = useState<string[]>([])

  const groups = useMemo(() => {
    if (group === "none") return [{ key: "", label: null as React.ReactNode, items }]
    if (group === "status") {
      return ITEM_STATUSES.map((s) => ({
        key: s,
        label: (
          <>
            <StatusIcon status={s} /> {ITEM_STATUS[s].label}
          </>
        ),
        items: items.filter((i) => i.status === s),
      })).filter((g) => g.items.length)
    }
    const order = [...products.map((p) => p.key), "IN"]
    const keys = [...new Set(items.map((i) => i.productKey))].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    return keys.map((k) => {
      const p = byKey.get(k)
      return {
        key: k,
        label: (
          <>
            {p ? <ProductAvatar name={p.name} color={p.color} icon={p.icon} className="size-4.5 rounded text-[0.45rem]" /> : <InboxAvatar className="size-4.5 rounded" />}
            {p?.name ?? "Inbox"}
          </>
        ),
        items: items.filter((i) => i.productKey === k),
      }
    })
  }, [group, items, products, byKey])

  if (items.length === 0) return <>{empty}</>
  return (
    <div className="divide-y rounded-xl border bg-card">
      {groups.map((g) => {
        const shut = closed.includes(g.key)
        return (
          <div key={g.key}>
            {g.label && (
              <button
                type="button"
                onClick={() => setClosed(shut ? closed.filter((k) => k !== g.key) : [...closed, g.key])}
                className="sticky top-0 z-[1] flex h-9 w-full items-center gap-2 rounded-t-xl border-b bg-surface px-3 text-left text-[0.8125rem] font-medium"
              >
                <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", !shut && "rotate-90")} />
                {g.label}
                <span className="text-xs font-normal text-muted-foreground">{g.items.length}</span>
              </button>
            )}
            {!shut && (
              <div className="divide-y">
                {g.items.map((it) => (
                  <ItemRow key={it.id} item={it} product={byKey.get(it.productKey)} showProduct={showProduct && group !== "product"} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
