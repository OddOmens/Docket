import { ChevronDown, X } from "lucide-react"
import { useState } from "react"

import { FilterBar } from "@/components/filter-bar"
import { ItemList, type Grouping } from "@/components/item-list"
import { Page } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useItems, useProducts } from "@/hooks/use-data"
import { toItemFilter, useFilters } from "@/hooks/use-filters"
import type { ItemFilter } from "@/lib/api"

type Sort = NonNullable<ItemFilter["sort"]>
const SORTS: { v: Sort; label: string }[] = [
  { v: "updated", label: "Recently updated" },
  { v: "created", label: "Newest" },
  { v: "severity", label: "Severity" },
  { v: "due", label: "Due date" },
  { v: "position", label: "Board order" },
]

function readPref<T extends string>(k: string, d: T): T {
  try {
    return (localStorage.getItem(k) as T) || d
  } catch {
    return d
  }
}
function writePref(k: string, v: string) {
  try {
    localStorage.setItem(k, v)
  } catch {
    // Remembered for this visit only.
  }
}

export default function ItemsPage() {
  return <ItemsScreen />
}

/** Items as a list, filtered, sorted and grouped. */
export function ItemsScreen({ product, section, header = true }: { product?: string; section?: string; header?: boolean }) {
  const { filters, set } = useFilters()
  const { data: products = [] } = useProducts()
  const keys = section === undefined ? undefined : products.filter((p) => p.group.toLowerCase() === section.toLowerCase() && p.status !== "archived").map((p) => p.key)
  const [sort, setSort] = useState<Sort>(() => readPref("docket.list.sort", "updated"))
  const [group, setGroup] = useState<Grouping>(() => readPref<Grouping>("docket.list.group", product ? "status" : "product"))
  const { data, isLoading } = useItems({ ...toItemFilter(filters, product, section), sort, open: !filters.closed && filters.status.length === 0, limit: 1000 })
  const items = data?.items ?? []
  return (
    <Page
      header={
        header ? (
          <>
            <h1 className="text-base font-semibold">All items</h1>
            <span className="text-sm text-muted-foreground tabular-nums">{data?.total ?? ""}</span>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-3 px-3 py-3 md:px-5">
        <FilterBar filters={filters} set={set} fixedProduct={!!product} onlyProducts={keys} showStatus>
          {filters.overdue && (
            <Button variant="secondary" size="sm" className="h-7 font-normal" onClick={() => set({ overdue: false })}>
              Overdue <X className="text-muted-foreground" />
            </Button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch checked={filters.closed} onCheckedChange={(v) => set({ closed: v })} size="sm" />
            Closed
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-normal">
                View <ChevronDown className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Group by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={group} onValueChange={(v) => (setGroup(v as Grouping), writePref("docket.list.group", v))}>
                <DropdownMenuRadioItem value="none">Nothing</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
                {!product && <DropdownMenuRadioItem value="product">Product</DropdownMenuRadioItem>}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sort} onValueChange={(v) => (setSort(v as Sort), writePref("docket.list.sort", v))}>
                {SORTS.map((s) => (
                  <DropdownMenuRadioItem key={s.v} value={s.v}>
                    {s.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </FilterBar>
        {isLoading ? (
          <Skeleton className="h-60 rounded-xl" />
        ) : (
          <ItemList
            items={items}
            group={product && group === "product" ? "status" : group}
            showProduct={!product}
            empty={
              <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                {filters.q || filters.type.length || filters.severity.length || filters.label || filters.overdue ? "Nothing matches these filters." : "No open items. Press C to add one."}
              </div>
            }
          />
        )}
        {data && data.total > items.length && <p className="text-xs text-muted-foreground">Showing the first {items.length} of {data.total}. Narrow the filters to see the rest.</p>}
      </div>
    </Page>
  )
}
