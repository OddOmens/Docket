
import { Board } from "@/components/board"
import { FilterBar } from "@/components/filter-bar"
import { PageHeader } from "@/components/page-header"
import { useItems, useProducts } from "@/hooks/use-data"
import { toItemFilter, useFilters } from "@/hooks/use-filters"

/** Every product's items as one board. */
export default function BoardPage() {
  return <BoardScreen />
}

export function BoardScreen({ product, section, header = true }: { product?: string; section?: string; header?: boolean }) {
  const { filters, set } = useFilters()
  const { data, isLoading } = useItems({ ...toItemFilter(filters, product, section), limit: 1000 })
  const { data: products = [] } = useProducts()
  const keys = section === undefined ? undefined : products.filter((p) => p.group.toLowerCase() === section.toLowerCase() && p.status !== "archived").map((p) => p.key)
  return (
    <div className="flex h-full min-h-0 flex-col">
      {header && (
        <PageHeader>
          <h1 className="text-base font-semibold">Board</h1>
          <span className="text-sm text-muted-foreground tabular-nums">{data?.total ?? ""}</span>
        </PageHeader>
      )}
      <div className="px-3 py-3 md:px-5">
        <FilterBar filters={filters} set={set} fixedProduct={!!product} onlyProducts={keys} />
      </div>
      <div className="min-h-0 flex-1">
        <Board items={data?.items ?? []} product={product} addTo={filters.product || keys?.[0]} loading={isLoading} />
      </div>
    </div>
  )
}
