import { cn } from "cn"
import { ListChecks, MessageSquare } from "lucide-react"

import { DueChip, LabelChip, SeverityBadge, StatusIcon, TypeIcon } from "@/components/badges"
import { OptionMenu, severityOptions, statusOptions } from "@/components/pickers"
import { InboxAvatar, ProductAvatar } from "@/components/product-avatar"
import { useItemSheet, useUpdateItem } from "@/hooks/use-data"
import { isClosed, type Item, type Product } from "@/lib/api"
import { relativeTime } from "@/lib/format"

/** One item in a list, with its status and severity changeable in place. */
export function ItemRow({ item, product, showProduct = true, extra }: { item: Item; product?: Product; showProduct?: boolean; extra?: React.ReactNode }) {
  const { open } = useItemSheet()
  const update = useUpdateItem()
  const closed = isClosed(item.status)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(item.ref)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && open(item.ref)}
      className="group flex min-h-10 cursor-pointer items-center gap-2 px-3 py-1.5 text-sm outline-none hover:bg-accent/60 focus-visible:bg-accent pointer-coarse:min-h-12"
    >
      <div onClick={(e) => e.stopPropagation()} className="flex">
        <OptionMenu value={item.status} options={statusOptions} label="Status" onChange={(status) => update.mutate({ ref: item.ref, input: { status } })}>
          <button type="button" aria-label="Change status" className="grid size-6 place-items-center rounded hover:bg-accent">
            <StatusIcon status={item.status} />
          </button>
        </OptionMenu>
      </div>
      <span className="hidden w-16 shrink-0 font-mono text-xs text-muted-foreground sm:block">{item.ref}</span>
      <TypeIcon type={item.type} className="size-3.5" />
      <span className={cn("min-w-0 flex-1 truncate", closed && "text-muted-foreground line-through decoration-muted-foreground/40")}>{item.title}</span>
      <span className="hidden items-center gap-1 lg:flex">
        {item.labels.slice(0, 3).map((l) => (
          <LabelChip key={l} label={l} />
        ))}
      </span>
      {item.checklist.total > 0 && (
        <span className="hidden items-center gap-0.5 text-xs text-muted-foreground md:inline-flex">
          <ListChecks className="size-3.5" /> {item.checklist.done}/{item.checklist.total}
        </span>
      )}
      {item.comments > 0 && (
        <span className="hidden items-center gap-0.5 text-xs text-muted-foreground md:inline-flex">
          <MessageSquare className="size-3.5" /> {item.comments}
        </span>
      )}
      {item.milestone && <span className="hidden max-w-32 truncate text-xs text-muted-foreground xl:block">◆ {item.milestone}</span>}
      {showProduct && (
        <span className="hidden max-w-36 items-center gap-1.5 text-xs text-muted-foreground md:flex">
          {product ? <ProductAvatar name={product.name} color={product.color} icon={product.icon} className="size-4 rounded text-[0.45rem]" /> : <InboxAvatar className="size-4 rounded" />}
          <span className="truncate">{item.productName}</span>
        </span>
      )}
      <DueChip due={item.due} closed={closed} />
      <div onClick={(e) => e.stopPropagation()} className="flex">
        <OptionMenu value={item.severity} options={severityOptions} label="Severity" align="end" onChange={(severity) => update.mutate({ ref: item.ref, input: { severity } })}>
          <button type="button" aria-label="Change severity" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <SeverityBadge severity={item.severity} />
          </button>
        </OptionMenu>
      </div>
      {extra}
      <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground sm:block">{relativeTime(item.updated * 1000)}</span>
    </div>
  )
}
