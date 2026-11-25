import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "cn"
import { CalendarClock, CircleDot, Flame, ListTodo, Plus } from "lucide-react"
import { Link } from "react-router"

import { DueChip, ProductStatusBadge, SeverityBadge, StatusIcon, TypeIcon } from "@/components/badges"
import { describeActivity } from "@/components/item-sheet"
import { Page, PageTitle } from "@/components/page-header"
import { ProductAvatar } from "@/components/product-avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useGroups, useItemSheet, useOverview } from "@/hooks/use-data"
import { api, type Activity, type Item, type Product } from "@/lib/api"
import { relativeTime } from "@/lib/format"
import { SEVERITY } from "@/lib/meta"
import { openNewProduct } from "@/lib/ui-events"

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

export default function HomePage() {
  const { data, isLoading } = useOverview()
  const { data: session } = useQuery({ queryKey: ["session"], queryFn: api.session, staleTime: Infinity })
  const t = data?.totals
  const urgent = (t?.critical ?? 0) + (t?.high ?? 0)
  const tiles = [
    { label: "Open", value: t?.open, icon: ListTodo, to: "/items" },
    { label: "In progress", value: t?.inProgress, icon: CircleDot, to: "/items?status=in_progress,review" },
    { label: "Critical or high", value: t ? urgent : undefined, icon: Flame, to: "/items?severity=critical,high", tone: urgent ? "text-red-600 dark:text-red-400" : "" },
    { label: "Overdue", value: t?.overdue, icon: CalendarClock, to: "/items?overdue=1", tone: t?.overdue ? "text-red-600 dark:text-red-400" : "" },
  ]
  const live = data?.products.filter((p) => p.status !== "archived").length ?? 0
  const quiet = !isLoading && !data?.urgent.length && !data?.dueSoon.length && !data?.inProgress.length
  return (
    <Page>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-8 md:py-10">
        <PageTitle title={`${greeting()}${session?.name ? `, ${session.name.split(" ")[0]}` : ""}`}>
          {t ? `${t.open} open across ${live} ${live === 1 ? "product" : "products"}${t.doneThisWeek ? ` · ${t.doneThisWeek} done this week` : ""}` : " "}
        </PageTitle>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {tiles.map((tile) => (
            <Link key={tile.label} to={tile.to} className="group rounded-xl border bg-card px-3.5 py-3 transition-colors hover:border-foreground/20">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <tile.icon className="size-3.5" /> {tile.label}
              </div>
              <div className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", tile.tone)}>{tile.value ?? <Skeleton className="mt-1 h-7 w-10" />}</div>
            </Link>
          ))}
        </div>

        {quiet ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing urgent, due soon or in progress. Press <kbd className="rounded border px-1 font-sans text-xs">C</kbd> to add an item.
          </p>
        ) : (
          <>
            {(isLoading || !!data?.urgent.length || !!data?.dueSoon.length) && (
              <div className="grid gap-6 lg:grid-cols-2">
                {(isLoading || !!data?.urgent.length) && <Panel title="Needs attention" hint="Open critical and high items" loading={isLoading} items={data?.urgent} />}
                {(isLoading || !!data?.dueSoon.length) && <Panel title="Due soon" hint="Overdue, or due in the next two weeks" loading={isLoading} items={data?.dueSoon} due />}
              </div>
            )}
            {!!data?.inProgress.length && <Panel title="In progress" items={data.inProgress} columns />}
          </>
        )}

        <ProductList products={data?.products} loading={isLoading} />

        {!!data?.recent.length && (
          <section>
            <SectionHead title="Recent activity" />
            <ActivityFeed entries={data.recent.slice(0, 10)} />
          </section>
        )}
      </div>
    </Page>
  )
}

function SectionHead({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-end gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <span className="text-xs text-muted-foreground max-sm:hidden">{hint}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  )
}

function Panel({ title, hint, items, loading, due, columns }: { title: string; hint?: string; items?: Item[]; loading?: boolean; due?: boolean; columns?: boolean }) {
  const { open } = useItemSheet()
  return (
    <section className="min-w-0">
      <SectionHead title={title} hint={hint} />
      <div className={cn("rounded-xl border bg-card", columns && items?.length ? "grid divide-y md:grid-cols-2 md:divide-y-0 md:[&>*]:border-b" : "divide-y")}>
        {loading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="m-3 h-5" />)}
        {items?.slice(0, 12).map((it) => (
          <button key={it.id} type="button" onClick={() => open(it.ref)} className="flex min-h-10 w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60 pointer-coarse:min-h-12">
            <StatusIcon status={it.status} />
            <TypeIcon type={it.type} className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">{it.title}</span>
            <span className="hidden font-mono text-[0.6875rem] text-muted-foreground sm:block">{it.ref}</span>
            {due ? <DueChip due={it.due} /> : <SeverityBadge severity={it.severity} />}
          </button>
        ))}
      </div>
    </section>
  )
}

/** Every live product as one compact row, under its group: a glance at where the open work is. */
function ProductList({ products, loading }: { products?: Product[]; loading?: boolean }) {
  const { data: sections = [] } = useGroups()
  const groups = useMemo(() => {
    const live = (products ?? []).filter((p) => p.status !== "archived").sort((a, b) => a.position - b.position)
    const names = ["", ...sections]
    for (const p of live) if (!names.some((n) => n.toLowerCase() === p.group.toLowerCase())) names.push(p.group)
    return names
      .map((g) => ({ name: g, products: live.filter((p) => p.group.toLowerCase() === g.toLowerCase()) }))
      .filter((g) => g.products.length > 0)
  }, [products, sections])
  return (
    <section>
      <SectionHead
        title="Products"
        action={
          <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={openNewProduct}>
            <Plus /> New product
          </Button>
        }
      />
      {loading && <Skeleton className="h-40 rounded-xl" />}
      {!loading && groups.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">Add each app, site, server or tool you work on, then track its features and bugs.</p>
          <Button size="sm" className="mt-4" onClick={openNewProduct}>
            <Plus /> New product
          </Button>
        </div>
      )}
      <div className="grid gap-5">
        {groups.map((g) => (
          <div key={g.name || "-"}>
            {g.name && (
              <h3 className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">
                <Link to={`/s/${encodeURIComponent(g.name)}`} className="hover:text-foreground">
                  {g.name}
                </Link>
              </h3>
            )}
            <div className="grid overflow-hidden rounded-xl border bg-card md:grid-cols-2 [&>*]:border-b md:[&>*:nth-child(odd)]:border-r">
              {g.products.map((p) => (
                <ProductRow key={p.key} p={p} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ProductRow({ p }: { p: Product }) {
  const c = p.counts
  return (
    <Link to={`/p/${encodeURIComponent(p.key)}`} className="-mb-px flex min-h-11 min-w-0 items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent/60">
      <ProductAvatar name={p.name} color={p.color} icon={p.icon} className="size-6 rounded-md text-[0.55rem]" />
      <span className="min-w-0 truncate font-medium">{p.name}</span>
      <ProductStatusBadge status={p.status} />
      {p.version && <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground max-sm:hidden">v{p.version.replace(/^v/, "")}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {(["critical", "high"] as const).map((s) =>
          c?.bySeverity[s] ? (
            <span key={s} className={cn("inline-flex h-5 items-center rounded-full px-1.5 text-[0.6875rem] font-medium tabular-nums", SEVERITY[s].className)}>
              {c.bySeverity[s]} {SEVERITY[s].label.toLowerCase()}
            </span>
          ) : null,
        )}
        {!!c?.overdue && <span className="text-[0.6875rem] font-medium text-red-600 dark:text-red-400">{c.overdue} overdue</span>}
        <span className={cn("w-14 text-right text-xs tabular-nums", c?.open ? "text-foreground" : "text-muted-foreground")}>{c?.open ? `${c.open} open` : "—"}</span>
      </span>
    </Link>
  )
}

export function ActivityFeed({ entries, loading, showProduct = true }: { entries?: Activity[]; loading?: boolean; showProduct?: boolean }) {
  const { open } = useItemSheet()
  if (loading) return <Skeleton className="h-40 rounded-xl" />
  if (!entries?.length) return <p className="rounded-xl border px-4 py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
  return (
    <ol className="divide-y rounded-xl border bg-card">
      {entries.map((a) => (
        <li key={a.id} className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
          <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[0.55rem] font-semibold", a.actor === "You" ? "bg-foreground text-background" : "bg-brand-soft text-brand")}>
            {a.actor.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <span className="font-medium">{a.actor}</span> <span className="text-muted-foreground">{describeActivity(a, a.itemRef || a.productName || "this")}</span>
            {a.itemRef && (
              <button type="button" className="block max-w-full truncate text-left text-[0.8125rem] hover:underline" onClick={() => open(a.itemRef!)}>
                {a.itemTitle}
                {showProduct && a.productName && <span className="text-muted-foreground"> · {a.productName}</span>}
              </button>
            )}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(a.created * 1000)}</span>
        </li>
      ))}
    </ol>
  )
}
