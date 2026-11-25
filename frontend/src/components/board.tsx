import { useEffect, useMemo, useState } from "react"
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "cn"
import { ChevronsLeftRight, Plus } from "lucide-react"

import { StatusIcon } from "@/components/badges"
import { ItemCard } from "@/components/item-card"
import { Button } from "@/components/ui/button"
import { useItemSheet, useProducts, useUpdateItem } from "@/hooks/use-data"
import { ITEM_STATUSES, type Item, type ItemStatus, type Product } from "@/lib/api"
import { ITEM_STATUS } from "@/lib/meta"
import { openNewItem } from "@/lib/ui-events"

type Columns = Record<ItemStatus, string[]>

const FOLDED = "docket.board.folded"

function readFolded(): ItemStatus[] {
  try {
    const v = JSON.parse(localStorage.getItem(FOLDED) ?? "null")
    return Array.isArray(v) ? v : ["cancelled"]
  } catch {
    return ["cancelled"]
  }
}

function columnsOf(items: Item[]): Columns {
  const cols = Object.fromEntries(ITEM_STATUSES.map((s) => [s, [] as string[]])) as Columns
  for (const it of [...items].sort((a, b) => a.position - b.position || a.id - b.id)) cols[it.status].push(it.ref)
  return cols
}

/** Where a card dropped at index in list goes, from its neighbours' positions. */
function positionAt(list: string[], index: number, byRef: Map<string, Item>) {
  const prev = index > 0 ? byRef.get(list[index - 1])?.position : undefined
  const next = index < list.length - 1 ? byRef.get(list[index + 1])?.position : undefined
  if (prev !== undefined && next !== undefined) return (prev + next) / 2
  if (prev !== undefined) return prev + 1
  if (next !== undefined) return next - 1
  return 1
}

/**
 * Kanban board over items: one column per status. Cards move between and
 * within columns by dragging (mouse at once, touch after a short press, or
 * the keyboard with space and the arrows).
 */
/** product: the board is one product's. addTo: where new items go otherwise. */
export function Board({ items, product, addTo, loading }: { items: Item[]; product?: string; addTo?: string; loading?: boolean }) {
  const { data: products = [] } = useProducts()
  const productsByKey = useMemo(() => new Map(products.map((p) => [p.key, p])), [products])
  const byRef = useMemo(() => new Map(items.map((i) => [i.ref, i])), [items])
  const [cols, setCols] = useState<Columns>(() => columnsOf(items))
  const [active, setActive] = useState<string | null>(null)
  const [folded, setFolded] = useState<ItemStatus[]>(readFolded)
  const update = useUpdateItem()
  const { open } = useItemSheet()

  useEffect(() => {
    if (!active) setCols(columnsOf(items))
  }, [items, active])

  const toggleFold = (s: ItemStatus) => {
    const next = folded.includes(s) ? folded.filter((x) => x !== s) : [...folded, s]
    setFolded(next)
    try {
      localStorage.setItem(FOLDED, JSON.stringify(next))
    } catch {
      // Remembered for this visit only.
    }
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const containerOf = (id: string, c: Columns = cols): ItemStatus | undefined =>
    (ITEM_STATUSES as readonly string[]).includes(id) ? (id as ItemStatus) : ITEM_STATUSES.find((s) => c[s].includes(id))

  const onDragStart = (e: DragStartEvent) => setActive(String(e.active.id))

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    if (!over) return
    const from = containerOf(String(a.id))
    const to = containerOf(String(over.id))
    if (!from || !to || from === to) return
    setCols((c) => {
      const src = c[from].filter((r) => r !== a.id)
      const dst = [...c[to]]
      const overIndex = dst.indexOf(String(over.id))
      dst.splice(overIndex >= 0 ? overIndex : dst.length, 0, String(a.id))
      return { ...c, [from]: src, [to]: dst }
    })
  }

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const ref = String(a.id)
    setActive(null)
    const item = byRef.get(ref)
    const to = over ? containerOf(String(over.id)) : undefined
    if (!item || !to || !over) {
      setCols(columnsOf(items))
      return
    }
    let list = cols[to]
    const oldIndex = list.indexOf(ref)
    const overIndex = list.indexOf(String(over.id))
    if (overIndex >= 0 && oldIndex !== overIndex) list = arrayMove(list, oldIndex, overIndex)
    setCols((c) => ({ ...c, [to]: list }))
    const index = list.indexOf(ref)
    const before = columnsOf(items)[item.status]
    if (to === item.status && before.indexOf(ref) === index) return
    const position = positionAt(list, index, byRef)
    update.mutate({ ref, input: { ...(to !== item.status && { status: to }), position } })
  }

  const dragged = active ? byRef.get(active) : undefined

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActive(null), setCols(columnsOf(items)))}>
      <div className="flex h-full min-h-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-3 pb-3 md:snap-none md:px-5">
        {ITEM_STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            refs={cols[s]}
            byRef={byRef}
            products={productsByKey}
            showProduct={!product}
            folded={folded.includes(s)}
            onFold={() => toggleFold(s)}
            onOpen={open}
            onAdd={() => openNewItem({ status: s, ...((product || addTo) && { product: product || addTo }) })}
            loading={loading}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {dragged ? <ItemCard item={dragged} product={productsByKey.get(dragged.productKey)} showProduct={!product} dragging className="w-[17rem] cursor-grabbing" /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  status,
  refs,
  byRef,
  products,
  showProduct,
  folded,
  onFold,
  onOpen,
  onAdd,
  loading,
}: {
  status: ItemStatus
  refs: string[]
  byRef: Map<string, Item>
  products: Map<string, Product>
  showProduct: boolean
  folded: boolean
  onFold: () => void
  onOpen: (ref: string) => void
  onAdd: () => void
  loading?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const m = ITEM_STATUS[status]
  if (folded) {
    return (
      <div ref={setNodeRef} className={cn("flex w-10 shrink-0 snap-start flex-col items-center gap-2 rounded-xl bg-muted/60 py-3", isOver && "bg-accent ring-1 ring-ring/30")}>
        <Button variant="ghost" size="icon-sm" aria-label={`Show ${m.label}`} onClick={onFold}>
          <ChevronsLeftRight />
        </Button>
        <StatusIcon status={status} />
        <span className="text-xs text-muted-foreground">{refs.length}</span>
        <span className="text-xs font-medium text-muted-foreground [writing-mode:vertical-rl]">{m.label}</span>
      </div>
    )
  }
  return (
    <section
      aria-label={m.label}
      className={cn("flex w-[min(85vw,18rem)] shrink-0 snap-start flex-col rounded-xl bg-muted/60 transition-colors md:w-72", isOver && "bg-accent")}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 pr-1.5 pl-3">
        <StatusIcon status={status} />
        <h2 className="text-sm font-medium">{m.label}</h2>
        <span className="text-xs text-muted-foreground">{refs.length}</span>
        <span className="ml-auto flex">
          {(status === "done" || status === "cancelled") && (
            <Button variant="ghost" size="icon-sm" aria-label={`Fold ${m.label}`} className="text-muted-foreground" onClick={onFold}>
              <ChevronsLeftRight />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label={`New item in ${m.label}`} className="text-muted-foreground" onClick={onAdd}>
            <Plus />
          </Button>
        </span>
      </header>
      <SortableContext id={status} items={refs} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
          {loading && refs.length === 0 && Array.from({ length: 2 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-background/70" />)}
          {refs.map((ref) => {
            const it = byRef.get(ref)
            return it ? <SortableCard key={ref} item={it} product={products.get(it.productKey)} showProduct={showProduct} onOpen={onOpen} /> : null
          })}
        </div>
      </SortableContext>
    </section>
  )
}

function SortableCard({ item, product, showProduct, onOpen }: { item: Item; product?: Product; showProduct: boolean; onOpen: (ref: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.ref })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(item.ref)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === "Enter") onOpen(item.ref)
      }}
      className={cn("cursor-pointer touch-manipulation rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring [-webkit-touch-callout:none]", isDragging && "opacity-30")}
    >
      <ItemCard item={item} product={product} showProduct={showProduct} />
    </div>
  )
}
