import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "cn"
import { KanbanSquare, LayoutDashboard, List } from "lucide-react"
import { Navigate, NavLink, useParams } from "react-router"

import { ItemList } from "@/components/item-list"
import { Page } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { useGroups, useItems, useProducts } from "@/hooks/use-data"
import { api, type Product } from "@/lib/api"
import { BoardScreen } from "@/pages/board"
import { ActivityFeed, ProductRow } from "@/pages/home"
import { ItemsScreen } from "@/pages/items"
import { Box, Count } from "@/pages/product"

const TABS = [
  { id: "", label: "Overview", icon: LayoutDashboard },
  { id: "board", label: "Board", icon: KanbanSquare },
  { id: "list", label: "List", icon: List },
]

/** A sidebar section as a whole: a product family like Plinthio's server and apps. */
export default function SectionPage() {
  const { name: raw = "", tab = "" } = useParams()
  const { data: groups } = useGroups()
  const { data: all, isLoading } = useProducts()
  const name = groups?.find((g) => g.toLowerCase() === raw.toLowerCase()) ?? raw
  const products = useMemo(
    () => (all ?? []).filter((p) => p.group.toLowerCase() === name.toLowerCase() && p.status !== "archived").sort((a, b) => a.position - b.position),
    [all, name],
  )
  if (groups && all && !groups.some((g) => g.toLowerCase() === raw.toLowerCase())) return <Navigate to="/" replace />
  if (!TABS.some((t) => t.id === tab)) return <Navigate to={`/s/${encodeURIComponent(raw)}`} replace />
  const base = `/s/${encodeURIComponent(name)}`
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b px-3 pt-3 md:px-5 md:pt-4">
        <div className="flex items-baseline gap-2">
          <h1 className="truncate text-lg font-semibold tracking-tight">{name}</h1>
          <span className="text-xs text-muted-foreground">
            {isLoading ? "" : `${products.length} ${products.length === 1 ? "product" : "products"}`}
          </span>
        </div>
        <nav className="-mb-px mt-2 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <NavLink
              key={t.id}
              to={t.id ? `${base}/${t.id}` : base}
              end
              className={({ isActive }) =>
                cn(
                  "flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2 text-sm text-muted-foreground transition-colors hover:text-foreground [&>svg]:size-3.5 pointer-coarse:h-11",
                  isActive && "border-foreground font-medium text-foreground",
                )
              }
            >
              <t.icon /> {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="p-6">
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : tab === "" ? (
          <Overview name={name} products={products} base={base} />
        ) : tab === "board" ? (
          <BoardScreen key={name} section={name} header={false} />
        ) : (
          <ItemsScreen key={name} section={name} header={false} />
        )}
      </div>
    </div>
  )
}

function Overview({ name, products, base }: { name: string; products: Product[]; base: string }) {
  const { data: activity, isLoading } = useQuery({ queryKey: ["activity", "section", name], queryFn: () => api.activity({ section: name, limit: 15 }) })
  const { data: urgent } = useItems({ section: name, open: true, severity: ["critical", "high"], sort: "severity", limit: 8 })
  const sum = (f: (p: Product) => number) => products.reduce((n, p) => n + f(p), 0)
  return (
    <Page>
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 md:grid-cols-[minmax(0,1fr)_18rem] md:px-6">
        <div className="grid min-w-0 content-start gap-6">
          <section>
            <h2 className="mb-2.5 text-sm font-semibold">Products</h2>
            {products.length ? (
              <div className="grid overflow-hidden rounded-xl border bg-card [&>*]:border-b">
                {products.map((p) => (
                  <ProductRow key={p.key} p={p} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No products in this section yet. Drag some under its heading in the sidebar.</p>
            )}
          </section>

          {!!urgent?.items.length && (
            <section>
              <h2 className="mb-2.5 text-sm font-semibold">Needs attention</h2>
              <ItemList items={urgent.items} showProduct />
            </section>
          )}

          <section>
            <h2 className="mb-2.5 text-sm font-semibold">Recent activity</h2>
            <ActivityFeed entries={activity} loading={isLoading} />
          </section>
        </div>

        <aside className="grid content-start gap-4">
          <Box title="Summary">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <Count label="Open" n={sum((p) => p.counts?.open ?? 0)} to={`${base}/list`} />
              <Count label="In progress" n={sum((p) => (p.counts?.byStatus.in_progress ?? 0) + (p.counts?.byStatus.review ?? 0))} to={`${base}/board`} />
              <Count label="Done" n={sum((p) => p.counts?.byStatus.done ?? 0)} to={`${base}/list?status=done`} />
              <Count label="Overdue" n={sum((p) => p.counts?.overdue ?? 0)} to={`${base}/list?overdue=1`} alert />
            </div>
          </Box>
        </aside>
      </div>
    </Page>
  )
}
