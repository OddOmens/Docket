import { cn } from "cn"
import { CalendarClock } from "lucide-react"

import type { ItemStatus, ItemType, ProductStatus, Severity } from "@/lib/api"
import { daysFromToday, formatDue } from "@/lib/format"
import { ITEM_STATUS, ITEM_TYPE, PRODUCT_STATUS, SEVERITY } from "@/lib/meta"

const pill = "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[0.6875rem] font-medium whitespace-nowrap"

export function SeverityBadge({ severity, className, compact }: { severity: Severity; className?: string; compact?: boolean }) {
  const m = SEVERITY[severity]
  return <span className={cn(pill, m.className, compact && "px-1.5", className)}>{m.label}</span>
}

/** Just the severity's coloured bars: a quiet marker for cards. */
export function SeverityBars({ severity, className }: { severity: Severity; className?: string }) {
  const n = 4 - SEVERITY[severity].rank
  const color = severity === "critical" ? "bg-red-600" : severity === "high" ? "bg-orange-500" : severity === "medium" ? "bg-blue-500" : "bg-zinc-400"
  return (
    <span role="img" aria-label={`${SEVERITY[severity].label} severity`} className={cn("inline-flex h-3 items-end gap-px", className)}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-[1px]", i <= n ? color : "bg-border")} style={{ height: `${25 * i}%` }} />
      ))}
    </span>
  )
}

export function StatusIcon({ status, className }: { status: ItemStatus; className?: string }) {
  const m = ITEM_STATUS[status]
  return <m.icon aria-label={m.label} className={cn("size-4 shrink-0", m.className, className)} />
}

export function StatusBadge({ status, className }: { status: ItemStatus; className?: string }) {
  const m = ITEM_STATUS[status]
  return (
    <span className={cn(pill, "bg-muted px-1.5 text-foreground", className)}>
      <m.icon className={cn("size-3.5", m.className)} /> {m.label}
    </span>
  )
}

export function TypeIcon({ type, className }: { type: ItemType; className?: string }) {
  const m = ITEM_TYPE[type]
  return <m.icon aria-label={m.label} className={cn("size-4 shrink-0", m.className, className)} />
}

export function TypeBadge({ type, className }: { type: ItemType; className?: string }) {
  const m = ITEM_TYPE[type]
  return (
    <span className={cn(pill, "bg-muted px-1.5 text-foreground", className)}>
      <m.icon className={cn("size-3.5", m.className)} /> {m.label}
    </span>
  )
}

export function ProductStatusBadge({ status, className }: { status: ProductStatus; className?: string }) {
  const m = PRODUCT_STATUS[status]
  // 30% smaller than the other pills, outlined in the text colour.
  return <span className={cn("inline-flex h-3 shrink-0 items-center rounded-full border-[0.5px] border-current px-1.25 text-[0.4rem] leading-none font-medium whitespace-nowrap", m.className, className)}>{m.label}</span>
}

export function ProductStatusDot({ status, className }: { status: ProductStatus; className?: string }) {
  return <span role="img" aria-label={PRODUCT_STATUS[status].label} title={PRODUCT_STATUS[status].label} className={cn("inline-block size-1.5 shrink-0 rounded-full", PRODUCT_STATUS[status].dot, className)} />
}

export function LabelChip({ label, className, onRemove }: { label: string; className?: string; onRemove?: () => void }) {
  return (
    <span className={cn(pill, "border bg-background px-1.5 font-normal text-muted-foreground", className)}>
      <span className="text-tag">#</span>
      {label}
      {onRemove && (
        <button type="button" aria-label={`Remove ${label}`} className="-mr-0.5 ml-0.5 rounded-full px-0.5 hover:text-foreground" onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  )
}

/** A due date, red when overdue on an open item, amber when close. */
export function DueChip({ due, closed, className }: { due: string; closed?: boolean; className?: string }) {
  if (!due) return null
  const n = daysFromToday(due)
  const tone = closed ? "text-muted-foreground" : n < 0 ? "text-red-600 dark:text-red-400" : n <= 2 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-[0.6875rem] whitespace-nowrap", tone, className)} title={`Due ${due}`}>
      <CalendarClock className="size-3" />
      {formatDue(due)}
    </span>
  )
}
