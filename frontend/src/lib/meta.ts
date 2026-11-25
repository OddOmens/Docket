import {
  Bug,
  CircleCheck,
  CircleCheckBig,
  Circle,
  CircleDashed,
  CircleDot,
  CircleX,
  Eye,
  Lightbulb,
  Sparkles,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import type { ItemStatus, ItemType, ProductStatus, Severity } from "@/lib/api"

type Meta = { label: string; className: string }

/** Badge colours: soft background + text, readable in light and dark. */
export const SEVERITY: Record<Severity, Meta & { dot: string; rank: number }> = {
  low: { label: "Low", className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300", dot: "bg-zinc-400", rank: 3 },
  medium: { label: "Medium", className: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300", dot: "bg-blue-500", rank: 2 },
  high: { label: "High", className: "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300", dot: "bg-orange-500", rank: 1 },
  critical: { label: "Critical", className: "bg-red-600 text-white dark:bg-red-600 dark:text-white", dot: "bg-red-600", rank: 0 },
}

export const ITEM_TYPE: Record<ItemType, Meta & { icon: LucideIcon }> = {
  feature: { label: "Feature", icon: Sparkles, className: "text-violet-600 dark:text-violet-400" },
  bug: { label: "Bug", icon: Bug, className: "text-red-600 dark:text-red-400" },
  task: { label: "Task", icon: CircleCheck, className: "text-sky-600 dark:text-sky-400" },
  improvement: { label: "Improvement", icon: TrendingUp, className: "text-emerald-600 dark:text-emerald-400" },
  chore: { label: "Chore", icon: Wrench, className: "text-zinc-500 dark:text-zinc-400" },
  idea: { label: "Idea", icon: Lightbulb, className: "text-amber-600 dark:text-amber-400" },
}

export const ITEM_STATUS: Record<ItemStatus, Meta & { icon: LucideIcon }> = {
  backlog: { label: "Backlog", icon: CircleDashed, className: "text-zinc-400 dark:text-zinc-500" },
  todo: { label: "To do", icon: Circle, className: "text-zinc-500 dark:text-zinc-400" },
  in_progress: { label: "In progress", icon: CircleDot, className: "text-amber-500 dark:text-amber-400" },
  review: { label: "In review", icon: Eye, className: "text-violet-600 dark:text-violet-400" },
  done: { label: "Done", icon: CircleCheckBig, className: "text-green-600 dark:text-green-400" },
  cancelled: { label: "Cancelled", icon: CircleX, className: "text-zinc-400 dark:text-zinc-500" },
}

export const PRODUCT_STATUS: Record<ProductStatus, Meta & { dot: string }> = {
  planning: { label: "Planning", className: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300", dot: "bg-sky-500" },
  active: { label: "Active", className: "bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300", dot: "bg-green-500" },
  beta: { label: "Beta", className: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300", dot: "bg-violet-500" },
  maintenance: { label: "Maintenance", className: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300", dot: "bg-amber-500" },
  paused: { label: "Paused", className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300", dot: "bg-zinc-400" },
  deprecated: { label: "Deprecated", className: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300", dot: "bg-rose-500" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground", dot: "bg-zinc-300 dark:bg-zinc-600" },
}

/** Swatches for product colours. */
export const COLORS = ["#3b5bdb", "#1c7ed6", "#0c8599", "#099268", "#2f9e44", "#66a80f", "#f08c00", "#e8590c", "#e03131", "#c2255c", "#9c36b5", "#6741d9", "#495057", "#212529"]

/** Words for an activity field name. */
export const FIELD_LABEL: Record<string, string> = {
  title: "title",
  type: "type",
  status: "status",
  severity: "severity",
  startDate: "start date",
  due: "due date",
  labels: "labels",
  milestone: "milestone",
  ref: "product",
  body: "description",
  description: "description",
  key: "key",
  name: "name",
  group: "group",
  version: "version",
}

/** A field value from the activity log, in words. */
export function valueLabel(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "none"
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none"
  const s = String(v)
  if (field === "status") return ITEM_STATUS[s as ItemStatus]?.label ?? PRODUCT_STATUS[s as ProductStatus]?.label ?? s
  if (field === "severity") return SEVERITY[s as Severity]?.label ?? s
  if (field === "type") return ITEM_TYPE[s as ItemType]?.label ?? s
  return s
}
