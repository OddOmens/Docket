import { cn } from "cn"
import { ListChecks, MessageSquare } from "lucide-react"

import { DueChip, LabelChip, SeverityBars, TypeIcon } from "@/components/badges"
import { ProductAvatar } from "@/components/product-avatar"
import { isClosed, type Item, type Product } from "@/lib/api"

/** An item on the board. */
export function ItemCard({ item, product, showProduct, className, dragging }: { item: Item; product?: Product; showProduct?: boolean; className?: string; dragging?: boolean }) {
  const closed = isClosed(item.status)
  return (
    <div
      className={cn(
        "grid gap-2 rounded-lg border bg-card p-2.5 text-left text-sm transition-[box-shadow,border-color] hover:border-foreground/20",
        item.severity === "critical" && !closed && "border-l-2 border-l-red-600",
        dragging && "rotate-1 shadow-lg ring-1 ring-ring/30",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
        <TypeIcon type={item.type} className="size-3.5" />
        {showProduct && product && <ProductAvatar name={product.name} color={product.color} icon={product.icon} className="size-3.5 rounded-[3px] text-[0.4rem]" />}
        <span className="font-mono">{item.ref}</span>
        <SeverityBars severity={item.severity} className="ml-auto" />
      </div>
      <div className={cn("line-clamp-3 leading-snug font-medium", closed && "text-muted-foreground line-through decoration-muted-foreground/40")}>{item.title}</div>
      {(item.labels.length > 0 || item.due || item.checklist.total > 0 || item.comments > 0 || item.milestone) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {item.labels.slice(0, 3).map((l) => (
            <LabelChip key={l} label={l} className="h-4.5 text-[0.625rem]" />
          ))}
          {item.labels.length > 3 && <span className="text-[0.625rem] text-muted-foreground">+{item.labels.length - 3}</span>}
          {item.milestone && <span className="truncate text-[0.6875rem] text-muted-foreground">◆ {item.milestone}</span>}
          <span className="ml-auto flex items-center gap-2">
            {item.checklist.total > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[0.6875rem] text-muted-foreground">
                <ListChecks className="size-3" />
                {item.checklist.done}/{item.checklist.total}
              </span>
            )}
            {item.comments > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[0.6875rem] text-muted-foreground">
                <MessageSquare className="size-3" />
                {item.comments}
              </span>
            )}
            <DueChip due={item.due} closed={closed} />
          </span>
        </div>
      )}
    </div>
  )
}
