import { ArrowRightLeft, Inbox } from "lucide-react"
import { useMemo } from "react"

import { ItemRow } from "@/components/item-row"
import { Page } from "@/components/page-header"
import { ProductMenu } from "@/components/pickers"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useItems, useProducts, useUpdateItem } from "@/hooks/use-data"

/** Items with no product yet: quick captures waiting to be sorted. */
export default function InboxPage() {
  const { data, isLoading } = useItems({ product: "IN", open: true, sort: "created" })
  const { data: products = [] } = useProducts()
  const byKey = useMemo(() => new Map(products.map((p) => [p.key, p])), [products])
  const update = useUpdateItem()
  const items = data?.items ?? []
  return (
    <Page
      header={
        <>
          <h1 className="text-base font-semibold">Inbox</h1>
          <span className="text-sm text-muted-foreground tabular-nums">{data?.total ?? ""}</span>
        </>
      }
    >
      <div className="mx-auto grid w-full max-w-5xl gap-3 px-3 py-4 md:px-5">
        <p className="text-sm text-muted-foreground">Ideas and reports that don't belong to a product yet. Give each one a product to file it, or close it.</p>
        {isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : items.length === 0 ? (
          <div className="grid place-items-center gap-2 rounded-xl border border-dashed px-4 py-14 text-center text-sm text-muted-foreground">
            <Inbox className="size-6 opacity-50" />
            Inbox zero. New items without a product land here.
          </div>
        ) : (
          <div className="divide-y rounded-xl border bg-card">
            {items.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                product={byKey.get(it.productKey)}
                showProduct={false}
                extra={
                  <div onClick={(e) => e.stopPropagation()} className="flex">
                    <ProductMenu value="" allowInbox={false} onChange={(product) => update.mutate({ ref: it.ref, input: { product, status: it.status === "backlog" ? "todo" : it.status } })}>
                      <Button variant="outline" size="sm" className="h-7 font-normal">
                        <ArrowRightLeft /> <span className="max-sm:hidden">Move to…</span>
                      </Button>
                    </ProductMenu>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </div>
    </Page>
  )
}
