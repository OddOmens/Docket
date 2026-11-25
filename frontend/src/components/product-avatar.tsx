import { cn } from "cn"
import { Icon, Inbox } from "lucide-react"

import { initials } from "@/lib/format"
import { useLucideIcon } from "@/lib/lucide"

/** A product's coloured square with its Lucide icon, or its initials when it has none. */
export function ProductAvatar({ name, color, icon, className }: { name: string; color?: string; icon?: string; className?: string }) {
  const glyph = useLucideIcon(icon || undefined)
  return (
    <span
      aria-hidden
      className={cn("grid size-6 shrink-0 place-items-center rounded-md text-[0.6rem] font-semibold tracking-wide text-white select-none", className)}
      style={{ background: color || "var(--muted-foreground)" }}
    >
      {glyph ? <Icon icon={glyph} className="size-[62%]" strokeWidth={2.25} /> : glyph === undefined ? null : initials(name)}
    </span>
  )
}

/** The inbox's own avatar, for items with no product. */
export function InboxAvatar({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground", className)}>
      <Inbox className="size-[62%]" />
    </span>
  )
}
