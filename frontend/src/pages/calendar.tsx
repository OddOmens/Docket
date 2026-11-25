import { ChevronDown } from "lucide-react"
import { useSearchParams } from "react-router"

import { CalendarView } from "@/components/calendar-view"
import { PageHeader } from "@/components/page-header"
import { ProductMenu } from "@/components/pickers"
import { ProductAvatar } from "@/components/product-avatar"
import { Button } from "@/components/ui/button"
import { useProducts } from "@/hooks/use-data"

export default function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const product = params.get("product") ?? ""
  const { data: products = [] } = useProducts()
  const p = products.find((x) => x.key === product)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader>
        <h1 className="text-base font-semibold">Calendar</h1>
        <div className="ml-auto flex items-center gap-1">
          <ProductMenu
            value={product}
            allowInbox={false}
            onChange={(k) =>
              setParams((x) => {
                const n = new URLSearchParams(x)
                if (k) n.set("product", k)
                else n.delete("product")
                return n
              })
            }
          >
            <Button variant="outline" size="sm" className="h-7 font-normal">
              {p && <ProductAvatar name={p.name} color={p.color} icon={p.icon} className="size-4 rounded text-[0.45rem]" />}
              {p?.name ?? "All products"}
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </ProductMenu>
          {p && (
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setParams((x) => { const n = new URLSearchParams(x); n.delete("product"); return n })}>
              All
            </Button>
          )}
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 pt-3">
        <CalendarView product={product || undefined} />
      </div>
    </div>
  )
}
