import { useMemo } from "react"
import { useSearchParams } from "react-router"

import type { ItemFilter, ItemStatus, ItemType, Severity } from "@/lib/api"

export type Filters = {
  product: string
  type: ItemType[]
  severity: Severity[]
  status: ItemStatus[]
  label: string
  q: string
  closed: boolean
  overdue: boolean
}

const list = <T extends string>(v: string | null) => (v ? (v.split(",").filter(Boolean) as T[]) : [])

/** Board and list filters, kept in the address so a view can be bookmarked. */
export function useFilters() {
  const [params, setParams] = useSearchParams()
  const filters: Filters = useMemo(
    () => ({
      product: params.get("product") ?? "",
      type: list<ItemType>(params.get("type")),
      severity: list<Severity>(params.get("severity")),
      status: list<ItemStatus>(params.get("status")),
      label: params.get("label") ?? "",
      q: params.get("q") ?? "",
      closed: params.get("closed") === "1",
      overdue: params.get("overdue") === "1",
    }),
    [params],
  )
  const set = (patch: Partial<Filters>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        for (const [k, v] of Object.entries(patch)) {
          const s = Array.isArray(v) ? v.join(",") : typeof v === "boolean" ? (v ? "1" : "") : (v ?? "")
          if (s) next.set(k, s)
          else next.delete(k)
        }
        return next
      },
      { replace: true },
    )
  const active = !!(filters.type.length || filters.severity.length || filters.status.length || filters.label || filters.q || filters.overdue || (filters.product && true))
  return { filters, set, active }
}

/** The API filter for a set of filters, with the product (or section) fixed if given. */
export function toItemFilter(f: Filters, fixedProduct?: string, section?: string): ItemFilter {
  const product = fixedProduct || f.product || undefined
  return {
    product,
    section: product ? undefined : section,
    type: f.type,
    severity: f.severity,
    status: f.status,
    label: f.label || undefined,
    q: f.q || undefined,
    overdue: f.overdue || undefined,
  }
}
