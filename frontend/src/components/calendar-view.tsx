import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "cn"
import { ChevronLeft, ChevronRight, Diamond } from "lucide-react"

import { TypeIcon } from "@/components/badges"
import { Button } from "@/components/ui/button"
import { useItemSheet, useProducts } from "@/hooks/use-data"
import { api, isClosed, type Item, type Milestone } from "@/lib/api"
import { addDays, isoDate, parseDate, today } from "@/lib/format"
import { SEVERITY } from "@/lib/meta"
import { openNewItem } from "@/lib/ui-events"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Monday on or before s. */
function weekStart(s: string) {
  const d = parseDate(s)
  return addDays(s, -((d.getDay() + 6) % 7))
}

/**
 * A month (or week) of items by due date, with milestones. Items with a
 * start date show faintly on the day they start too.
 */
export function CalendarView({ product }: { product?: string }) {
  const [mode, setMode] = useState<"month" | "week">(() => (window.innerWidth < 640 ? "week" : "month"))
  const [anchor, setAnchor] = useState(today())
  const { data: products = [] } = useProducts()
  const colorOf = useMemo(() => new Map(products.map((p) => [p.key, p.color])), [products])
  const { open } = useItemSheet()

  const { from, to, days } = useMemo(() => {
    if (mode === "week") {
      const from = weekStart(anchor)
      return { from, to: addDays(from, 6), days: Array.from({ length: 7 }, (_, i) => addDays(from, i)) }
    }
    const a = parseDate(anchor)
    const first = isoDate(new Date(a.getFullYear(), a.getMonth(), 1))
    const from = weekStart(first)
    const last = isoDate(new Date(a.getFullYear(), a.getMonth() + 1, 0))
    const to = addDays(weekStart(last), 6)
    const days: string[] = []
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
    return { from, to, days }
  }, [mode, anchor])

  const { data } = useQuery({ queryKey: ["calendar", from, to, product ?? ""], queryFn: () => api.calendar(from, to, product), placeholderData: (p) => p })

  const byDay = useMemo(() => {
    const m = new Map<string, { due: Item[]; start: Item[]; milestones: Milestone[] }>()
    const at = (d: string) => {
      let e = m.get(d)
      if (!e) m.set(d, (e = { due: [], start: [], milestones: [] }))
      return e
    }
    for (const it of data?.items ?? []) {
      if (it.due) at(it.due).due.push(it)
      if (it.startDate && it.startDate !== it.due) at(it.startDate).start.push(it)
    }
    for (const ms of data?.milestones ?? []) if (ms.due) at(ms.due).milestones.push(ms)
    for (const e of m.values()) e.due.sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank)
    return m
  }, [data])

  const a = parseDate(anchor)
  const month = a.getMonth()
  const title =
    mode === "month"
      ? a.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : `${parseDate(from).toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${parseDate(to).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
  const step = (n: number) => {
    if (mode === "week") return setAnchor(addDays(anchor, 7 * n))
    setAnchor(isoDate(new Date(a.getFullYear(), a.getMonth() + n, 1)))
  }
  const now = today()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 pb-3 md:px-5">
        <h2 className="mr-auto text-lg font-semibold tracking-tight">{title}</h2>
        <div className="flex rounded-md border p-0.5">
          {(["month", "week"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cn("h-6 rounded px-2.5 text-xs capitalize", mode === m ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}>
              {m}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="h-7" onClick={() => setAnchor(today())}>
          Today
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Previous" onClick={() => step(-1)}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next" onClick={() => step(1)}>
          <ChevronRight />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3 md:px-5">
        <div className={cn("grid min-w-[42rem] grid-cols-7 overflow-hidden rounded-xl border bg-border gap-px", mode === "week" && "min-w-0 max-sm:grid-cols-1")}>
          {WEEKDAYS.map((d) => (
            <div key={d} className={cn("bg-surface px-2 py-1.5 text-xs font-medium text-muted-foreground", mode === "week" && "max-sm:hidden")}>
              {d}
            </div>
          ))}
          {days.map((d) => {
            const e = byDay.get(d)
            const dd = parseDate(d)
            const outside = mode === "month" && dd.getMonth() !== month
            return (
              <div
                key={d}
                onClick={(ev) => ev.target === ev.currentTarget && openNewItem({ due: d, ...(product && { product }) })}
                className={cn(
                  "group flex cursor-default flex-col gap-1 bg-card p-1.5",
                  mode === "month" ? "min-h-28" : "min-h-48 max-sm:min-h-20",
                  outside && "bg-surface",
                )}
              >
                <div className="pointer-events-none flex items-center gap-1 text-xs">
                  <span
                    className={cn(
                      "grid h-5 min-w-5 place-items-center rounded-full px-1",
                      outside ? "text-muted-foreground/60" : "text-muted-foreground",
                      d === now && "bg-brand font-semibold text-brand-foreground",
                    )}
                  >
                    {dd.getDate()}
                  </span>
                  {mode === "week" && <span className="text-muted-foreground sm:hidden">{dd.toLocaleDateString(undefined, { weekday: "long" })}</span>}
                </div>
                {e?.milestones.map((m) => (
                  <div key={`m${m.id}`} title={`${m.productName}: ${m.name}`} className="flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-0.5 text-[0.6875rem] font-medium text-brand">
                    <Diamond className="size-3 shrink-0 fill-current" />
                    <span className="truncate">{m.name}</span>
                  </div>
                ))}
                {e?.due.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => open(it.ref)}
                    title={`${it.ref} ${it.title}`}
                    className={cn(
                      "flex w-full items-center gap-1 rounded-md bg-muted/70 py-0.5 pr-1.5 pl-1 text-left text-[0.6875rem] hover:bg-accent",
                      isClosed(it.status) && "text-muted-foreground line-through opacity-70",
                    )}
                  >
                    <span className="h-3 w-0.5 shrink-0 rounded-full" style={{ background: colorOf.get(it.productKey) || "var(--muted-foreground)" }} />
                    <TypeIcon type={it.type} className="size-3" />
                    <span className="truncate">{it.title}</span>
                    {it.severity === "critical" && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-red-600" />}
                  </button>
                ))}
                {e?.start.map((it) => (
                  <button key={`s${it.id}`} type="button" onClick={() => open(it.ref)} className="truncate rounded-md px-1.5 text-left text-[0.6875rem] text-muted-foreground hover:bg-accent">
                    ▸ starts: {it.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Click an empty part of a day to add an item due then.</p>
      </div>
    </div>
  )
}
