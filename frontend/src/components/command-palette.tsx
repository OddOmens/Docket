import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays, FolderPlus, House, Inbox, KanbanSquare, List, Moon, Plus, Search, Settings, Sun, Trash2 } from "lucide-react"
import { useTheme } from "next-themes"
import { useNavigate } from "react-router"

import { ProductStatusBadge, StatusIcon, TypeIcon } from "@/components/badges"
import { ProductAvatar } from "@/components/product-avatar"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { useItemSheet, useProducts } from "@/hooks/use-data"
import { api } from "@/lib/api"
import { onUiEvent, openNewItem, openNewProduct } from "@/lib/ui-events"

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** ⌘K: find an item or product, or run a command. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const navigate = useNavigate()
  const { open: openItem } = useItemSheet()
  const { data: products = [] } = useProducts()
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !e.shiftKey) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    const off = onUiEvent("docket:palette", () => setOpen(true))
    return () => {
      window.removeEventListener("keydown", onKey)
      off()
    }
  }, [])

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const q = useDebounced(query.trim(), 150)
  const { data: hits } = useQuery({ queryKey: ["search", q], queryFn: () => api.search(q), enabled: open && q.length >= 1, placeholderData: (p) => p })
  const { data: recent } = useQuery({ queryKey: ["items", { sort: "updated", limit: 6, open: true }], queryFn: () => api.items({ sort: "updated", limit: 6, open: true }), enabled: open && !q })

  const lower = query.trim().toLowerCase()
  const items = q ? (hits?.items ?? []) : (recent?.items ?? [])
  const matchedProducts = q ? (hits?.products ?? []) : []
  const dark = resolvedTheme === "dark"
  const commands = [
    { id: "new-item", label: "New item", icon: Plus, shortcut: "C", run: () => openNewItem() },
    { id: "new-product", label: "New product", icon: FolderPlus, run: () => openNewProduct() },
    { id: "home", label: "Home", icon: House, run: () => navigate("/") },
    { id: "inbox", label: "Inbox", icon: Inbox, run: () => navigate("/inbox") },
    { id: "board", label: "Board", icon: KanbanSquare, run: () => navigate("/board") },
    { id: "items", label: "All items", icon: List, run: () => navigate("/items") },
    { id: "calendar", label: "Calendar", icon: CalendarDays, run: () => navigate("/calendar") },
    { id: "trash", label: "Trash", icon: Trash2, run: () => navigate("/trash") },
    { id: "settings", label: "Settings", icon: Settings, run: () => navigate("/settings") },
    { id: "api", label: "API and MCP tokens", icon: Settings, run: () => navigate("/settings/api") },
    { id: "theme", label: dark ? "Light theme" : "Dark theme", icon: dark ? Sun : Moon, run: () => setTheme(dark ? "light" : "dark") },
  ].filter((c) => !lower || c.label.toLowerCase().includes(lower))
  const productsShown = q ? matchedProducts : []
  const productsByName = !q ? [] : products.filter((p) => !productsShown.some((s) => s.key === p.key) && (p.name.toLowerCase().includes(lower) || p.key.toLowerCase() === lower))

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Find an item or product, or run a command" className="sm:max-w-xl">
      <Command shouldFilter={false} loop>
        <CommandInput placeholder="Search items, products and commands…" value={query} onValueChange={setQuery} />
        <CommandList className="max-h-[min(28rem,60vh)]">
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
              <Search className="size-5 opacity-60" />
              Nothing matches “{query}”
            </div>
          </CommandEmpty>
          {[...productsShown, ...productsByName].length > 0 && (
            <CommandGroup heading="Products">
              {[...productsShown, ...productsByName].map((p) => (
                <CommandItem key={p.key} value={`p:${p.key}`} onSelect={() => run(() => navigate(`/p/${encodeURIComponent(p.key)}`))}>
                  <ProductAvatar name={p.name} color={p.color} icon={p.icon} className="size-5 rounded text-[0.5rem]" />
                  <span className="truncate">{p.name}</span>
                  <ProductStatusBadge status={p.status} />
                  <CommandShortcut className="font-mono">{p.key}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {items.length > 0 && (
            <CommandGroup heading={q ? "Items" : "Recently updated"}>
              {items.map((it) => (
                <CommandItem key={it.id} value={`i:${it.ref}`} onSelect={() => run(() => openItem(it.ref))}>
                  <StatusIcon status={it.status} />
                  <TypeIcon type={it.type} className="size-3.5" />
                  <span className="truncate">{it.title}</span>
                  <CommandShortcut className="font-mono tracking-normal">{it.ref}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {lower && (
            <CommandGroup heading="Create">
              <CommandItem value="create-item" onSelect={() => run(() => openNewItem({ title: query.trim() }))}>
                <Plus className="text-muted-foreground" /> New item “{query.trim()}”
              </CommandItem>
            </CommandGroup>
          )}
          {commands.length > 0 && (
            <CommandGroup heading="Commands">
              {commands.map((c) => (
                <CommandItem key={c.id} value={`c:${c.id}`} onSelect={() => run(c.run)}>
                  <c.icon className="text-muted-foreground" />
                  {c.label}
                  {c.shortcut && <CommandShortcut>{c.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
