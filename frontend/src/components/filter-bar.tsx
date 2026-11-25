import { useEffect, useState } from "react"
import { ChevronDown, Search, X } from "lucide-react"

import { FilterMenu, ProductMenu, severityOptions, statusOptions, typeOptions } from "@/components/pickers"
import { ProductAvatar } from "@/components/product-avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useLabels, useProducts } from "@/hooks/use-data"
import type { Filters } from "@/hooks/use-filters"

/** Search and filters over items. */
export function FilterBar({
  filters,
  set,
  fixedProduct,
  onlyProducts,
  showStatus,
  children,
}: {
  filters: Filters
  set: (p: Partial<Filters>) => void
  fixedProduct?: boolean
  /** Limit the product menu to these keys (a section's products). */
  onlyProducts?: string[]
  showStatus?: boolean
  children?: React.ReactNode
}) {
  const [q, setQ] = useState(filters.q)
  useEffect(() => setQ(filters.q), [filters.q])
  useEffect(() => {
    if (q === filters.q) return
    const t = setTimeout(() => set({ q }), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])
  const { data: labels = [] } = useLabels()
  const { data: products = [] } = useProducts()
  const product = products.find((p) => p.key === filters.product)
  const any = filters.type.length || filters.severity.length || filters.status.length || filters.label || filters.q || (!fixedProduct && filters.product)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter items"
          className="h-7 w-40 rounded-md border bg-background pr-2 pl-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:w-48"
        />
      </label>
      {!fixedProduct && (
        <ProductMenu value={filters.product} onChange={(k) => set({ product: k })} allowInbox={false} only={onlyProducts}>
          <Button variant="outline" size="sm" className={product ? "h-7 border-foreground/30 bg-accent font-normal" : "h-7 font-normal"}>
            {product ? <ProductAvatar name={product.name} color={product.color} icon={product.icon} className="size-4 rounded text-[0.45rem]" /> : null}
            {product?.name ?? "Product"}
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </ProductMenu>
      )}
      {showStatus && <FilterMenu label="Status" options={statusOptions} value={filters.status} onChange={(v) => set({ status: v })} />}
      <FilterMenu label="Type" options={typeOptions} value={filters.type} onChange={(v) => set({ type: v })} />
      <FilterMenu label="Severity" options={severityOptions} value={filters.severity} onChange={(v) => set({ severity: v })} />
      {labels.length > 0 && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={filters.label ? "h-7 border-foreground/30 bg-accent font-normal" : "h-7 font-normal"}>
              {filters.label ? `#${filters.label}` : "Label"}
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 min-w-44">
            {filters.label && <DropdownMenuItem onSelect={() => set({ label: "" })}>Any label</DropdownMenuItem>}
            {labels.map((l) => (
              <DropdownMenuItem key={l.name} onSelect={() => set({ label: l.name })}>
                <span className="text-tag">#</span>
                {l.name}
                <span className="ml-auto text-xs text-muted-foreground">{l.open}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {any ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-muted-foreground"
          onClick={() => set({ type: [], severity: [], status: [], label: "", q: "", ...(!fixedProduct && { product: "" }) })}
        >
          <X /> Clear
        </Button>
      ) : null}
      {children && <div className="ml-auto flex items-center gap-1.5">{children}</div>}
    </div>
  )
}

