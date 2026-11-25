import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { cn } from "cn"
import { Archive, CalendarDays, ChevronRight, Heading, House, Inbox, KanbanSquare, List, LogOut, Monitor, Moon, MoreHorizontal, Package, Pencil, Plus, Search, Settings, Sun, Trash2 } from "lucide-react"
import { useTheme } from "next-themes"
import { Link, Outlet, useLocation, useNavigate } from "react-router"
import { toast } from "sonner"

import { ProductStatusBadge } from "@/components/badges"
import { Brand } from "@/components/brand"
import { CommandPalette } from "@/components/command-palette"
import { useHealthNotice } from "@/components/health"
import { ItemSheet } from "@/components/item-sheet"
import { NewItemDialog } from "@/components/new-item-dialog"
import { NewProductDialog } from "@/components/product-dialog"
import { ProductAvatar } from "@/components/product-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFold,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
  sidebarFade,
  sidebarLabel,
  useSidebar,
  useSidebarRail,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDialogs } from "@/components/dialogs"
import { invalidateWork, useGroups, useLiveUpdates, useOverview, useProducts } from "@/hooks/use-data"
import { DragGhost, DropLine, moveItem, useListDrag } from "@/hooks/use-list-drag"
import { api, type Product } from "@/lib/api"
import { errorMessage, initials } from "@/lib/format"
import { openNewItem, openNewProduct, openPalette } from "@/lib/ui-events"

export function AppShell() {
  useLiveUpdates()
  useHealthNotice()
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "16.5rem", "--frame-top": "max(0.5rem, var(--sat))", "--frame-bottom": "max(0.5rem, var(--sab))" } as React.CSSProperties}
      className="bg-background pr-(--sar) pl-(--sal) md:bg-canvas"
    >
      <TopBar />
      <AppSidebar />
      <SidebarInset className="mt-[calc(var(--topbar-h)+var(--sat))] h-[calc(100svh-var(--topbar-h)-var(--sat))] min-w-0 overflow-hidden md:m-2 md:mt-(--frame-top) md:mb-0 md:ml-0 md:h-[calc(100svh-var(--frame-top)-var(--frame-bottom))] md:rounded-2xl md:border">
        <Outlet />
      </SidebarInset>
      <CommandPalette />
      <NewItemDialog />
      <NewProductDialog />
      <ItemSheet />
    </SidebarProvider>
  )
}

export function useSignOut() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return async () => {
    await api.logout().catch(() => {})
    qc.clear()
    navigate("/login", { replace: true })
  }
}

/** Phones only: on a desktop the brand and toggle sit at the top of the sidebar. */
function TopBar() {
  return (
    <header data-bar="top" className="fixed inset-x-0 top-0 z-30 box-content flex h-(--topbar-h) items-center gap-2 border-b bg-background pt-(--sat) pr-[calc(0.75rem+var(--sar))] pl-[calc(0.75rem+var(--sal))] md:hidden">
      <SidebarTrigger className="text-muted-foreground pointer-coarse:size-11" />
      <Link to="/" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Brand />
      </Link>
      <span className="ml-auto flex">
        <Button variant="ghost" size="icon" aria-label="Search" className="text-muted-foreground pointer-coarse:size-11" onClick={openPalette}>
          <Search />
        </Button>
        <Button variant="ghost" size="icon" aria-label="New item" className="text-muted-foreground pointer-coarse:size-11" onClick={() => openNewItem()}>
          <Plus />
        </Button>
      </span>
    </header>
  )
}

function UserMenu({ onNavigate, side }: { onNavigate: () => void; side: "top" | "right" }) {
  const { data: account } = useQuery({ queryKey: ["account"], queryFn: api.account })
  const { theme, setTheme } = useTheme()
  const signOut = useSignOut()
  const name = account?.name ?? ""
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          className="flex h-10 w-[calc(100cqw-2.5rem)] flex-none items-center gap-2.5 overflow-hidden rounded-md px-1.5 text-left outline-none transition-[width] duration-(--sidebar-duration) ease-(--sidebar-ease) hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:w-10"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-[0.65rem] font-semibold text-background">{name ? initials(name) : ""}</span>
          <span className={cn(sidebarLabel, "max-w-[calc(100cqw-5.625rem)] text-sm font-medium")}>{name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={side === "top" ? "start" : "end"} className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium text-foreground">{name}</div>
          <div className="text-xs text-muted-foreground">Owner</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" onClick={onNavigate}>
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/trash" onClick={onNavigate}>
            <Trash2 /> Trash
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />} Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A row in the sidebar's product list: a section heading or a product. */
type Entry = { kind: "section"; name: string } | { kind: "product"; p: Product }

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Products without a section first, then each section heading (in order, empty ones too) and its products. */
function layout(products: Product[], sections: string[]): Entry[] {
  const byPos = [...products].sort((a, b) => a.position - b.position)
  const names = [...sections]
  for (const p of byPos) if (p.group && !names.some((n) => same(n, p.group))) names.push(p.group)
  const out: Entry[] = byPos.filter((p) => !p.group).map((p) => ({ kind: "product", p }))
  for (const name of names) {
    out.push({ kind: "section", name })
    for (const p of byPos) if (p.group && same(p.group, name)) out.push({ kind: "product", p })
  }
  return out
}

/** The list after dragging entries[from] to index to. A heading takes its products along and lands between sections. */
function dropEntry(entries: Entry[], from: number, to: number): Entry[] {
  const moved = entries[from]
  if (moved.kind === "product") return moveItem(entries, from, to)
  let end = from + 1
  while (end < entries.length && entries[end].kind === "product") end++
  const block = entries.slice(from, end)
  const rest = [...entries.slice(0, from), ...entries.slice(end)]
  const next = moveItem(entries, from, to)
  const after = next.slice(next.indexOf(moved) + 1).find((e) => !block.includes(e))
  let at = after ? rest.indexOf(after) : rest.length
  while (at < rest.length && rest[at].kind === "product") at++
  return [...rest.slice(0, at), ...block, ...rest.slice(at)]
}

const ARCHIVE_OPEN = "docket.sidebar.archived"

function AppSidebar() {
  const { data: products, isLoading } = useProducts()
  const { data: overview } = useOverview()
  const qc = useQueryClient()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const rail = useSidebarRail()
  const close = () => isMobile && setOpenMobile(false)
  const [archiveOpen, setArchiveOpen] = useState(() => {
    try {
      return localStorage.getItem(ARCHIVE_OPEN) === "1"
    } catch {
      return false
    }
  })

  const { data: sections = [] } = useGroups()
  const live = useMemo(() => (products ?? []).filter((p) => p.status !== "archived"), [products])
  const archived = (products ?? []).filter((p) => p.status === "archived")
  const entries = useMemo(() => layout(live, sections), [live, sections])
  const { prompt, confirm } = useDialogs()

  const save = (keys: string[], groups: Record<string, string>, order?: string[]) => {
    api.orderProducts(keys, groups, order).then(
      () => invalidateWork(qc),
      (e) => {
        toast.error(errorMessage(e))
        invalidateWork(qc)
      },
    )
  }

  const { boxRef, ghostRef, drag, start } = useListDrag((from, to) => {
    const next = dropEntry(entries, from, to)
    const groups: Record<string, string> = {}
    const order: string[] = []
    let current = ""
    for (const e of next) {
      if (e.kind === "section") order.push((current = e.name))
      else if (e.p.group !== current) groups[e.p.key] = current
    }
    const keys = [...next.flatMap((e) => (e.kind === "product" ? [e.p.key] : [])), ...archived.map((p) => p.key)]
    qc.setQueryData<string[]>(["groups"], order)
    qc.setQueryData<Product[]>(["products"], (old) =>
      old ? keys.map((k, i) => ({ ...old.find((p) => p.key === k)!, position: i + 1, ...(groups[k] !== undefined && { group: groups[k] }) })) : old,
    )
    save(keys, groups, order)
  })
  const dragged = drag ? entries[drag.from] : undefined

  const sectionAction = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      toast.error(errorMessage(e))
    }
    invalidateWork(qc)
  }
  const newSection = async () => {
    const name = await prompt({ title: "New section", description: "A heading in the sidebar. Drag products under it.", placeholder: "e.g. Self-hosted, Games, Clients", confirm: "Add section" })
    if (name) void sectionAction(() => api.createSection(name))
  }
  const renameSection = async (old: string) => {
    const name = await prompt({ title: "Rename section", defaultValue: old, confirm: "Rename" })
    if (name && name !== old) void sectionAction(() => api.renameSection(old, name))
  }
  const deleteSection = async (name: string) => {
    if (await confirm({ title: `Remove the section ${name}?`, description: "Its products stay, at the top of the list without a section.", confirm: "Remove section", destructive: true }))
      void sectionAction(() => api.deleteSection(name))
  }

  const item = "h-8 gap-2.5 text-[0.875rem] [&>svg]:size-4 [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-foreground"
  const label = cn(sidebarLabel, "max-w-[calc(100cqw-2.625rem)]")
  const inbox = overview?.totals.inbox ?? 0
  const nav = [
    { to: "/", label: "Home", icon: House },
    { to: "/inbox", label: "Inbox", icon: Inbox, count: inbox },
    { to: "/board", label: "Board", icon: KanbanSquare },
    { to: "/items", label: "All items", icon: List },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
  ]
  const search = (side: "top" | "right") => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Search" className="size-9 shrink-0 text-muted-foreground" onClick={() => (close(), openPalette())}>
          <Search className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>
        Search <Kbd className="ml-1">⌘K</Kbd>
      </TooltipContent>
    </Tooltip>
  )

  const productRow = (p: Product, i?: number) => {
    const to = `/p/${encodeURIComponent(p.key)}`
    const active = pathname === to || pathname.startsWith(to + "/")
    return (
      <SidebarMenuItem key={p.key} data-index={i} onPointerDown={i === undefined ? undefined : (e) => start(e, i)} className={cn(drag?.from === i && i !== undefined && "opacity-40")}>
        <SidebarMenuButton asChild isActive={active} tooltip={p.name} className={cn(item, "text-[0.75rem] [-webkit-touch-callout:none]")}>
          <Link to={to} onClick={close} draggable={false}>
            <ProductAvatar name={p.name} color={p.color} icon={p.icon} className={cn("-ml-px size-4.5 rounded-[5px] text-[0.45rem]", p.status === "archived" && "opacity-60")} />
            <span className={cn(label, "max-w-[calc(100cqw-6.75rem)]", p.status === "archived" && "text-muted-foreground")}>{p.name}</span>
            <span className={cn("ml-auto flex shrink-0 items-center gap-1.5", sidebarFade)}>
              <ProductStatusBadge status={p.status} />
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  const rows = entries.map((e, i) =>
    e.kind === "product" ? (
      productRow(e.p, i)
    ) : (
      <li
        key={`s:${e.name}`}
        data-index={i}
        inert={rail}
        onPointerDown={(ev) => start(ev, i)}
        className={cn("group/section flex h-7 cursor-grab items-center gap-1 pt-2 pr-1 pl-2 select-none active:cursor-grabbing", sidebarFade, drag?.from === i && "opacity-40")}
      >
        <Link
          to={`/s/${encodeURIComponent(e.name)}`}
          onClick={close}
          draggable={false}
          className={cn(
            "min-w-0 flex-1 truncate rounded-sm text-[0.6875rem] font-medium tracking-wide text-muted-foreground/80 uppercase hover:text-foreground [-webkit-touch-callout:none]",
            decodeURIComponent(pathname.split("/")[1] === "s" ? (pathname.split("/")[2] ?? "") : "").toLowerCase() === e.name.toLowerCase() && "text-foreground",
          )}
        >
          {e.name}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-nodrag
              aria-label={`${e.name} section options`}
              className="grid size-5 place-items-center rounded text-muted-foreground opacity-0 group-hover/section:opacity-100 hover:bg-sidebar-accent focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-44">
            <DropdownMenuItem onSelect={() => void renameSection(e.name)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void deleteSection(e.name)}>
              <Trash2 /> Remove section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    ),
  )

  return (
    <Sidebar variant="floating" collapsible="icon" className="top-[calc(var(--frame-top)-0.5rem)] bottom-[calc(max(0.5rem,var(--sab))-0.5rem)] h-auto data-[side=left]:left-(--sal)">
      <SidebarHeader className="gap-2 px-2 pt-3 pb-1">
        <div className="flex h-8 items-center justify-between pr-0.5 pl-2">
          <Link to="/" onClick={close} inert={rail} className={cn("rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", sidebarFade)}>
            <Brand />
          </Link>
          <SidebarTrigger className="top-3.5 right-3.5 z-10 bg-sidebar text-muted-foreground md:absolute" />
        </div>
        {/*
          Inset like the rows below (their group's padding), with the outline
          drawn as a shadow so it takes no room: the plus then sits in the
          same icon column as every other row, open or collapsed.
        */}
        <SidebarMenu className="px-1">
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="New item (C)" className={cn(item, "bg-background font-medium shadow-[inset_0_0_0_1px_var(--color-border)] hover:bg-sidebar-accent")} onClick={() => (close(), openNewItem())}>
              <Plus />
              <span className={label}>New item</span>
              <Kbd className={cn("ml-auto", sidebarFade)}>C</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1">
        <SidebarGroup className="py-1">
          <SidebarMenu className="gap-px">
            {nav.map(({ to, label: text, icon: Icon, count }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton asChild isActive={pathname === to} tooltip={text} className={item}>
                  <Link to={to} onClick={close}>
                    <Icon />
                    <span className={label}>{text}</span>
                    {!!count && <span className={cn("ml-auto rounded-full bg-brand-soft px-1.5 text-[0.6875rem] font-medium text-brand tabular-nums", sidebarFade)}>{count}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="pt-2">
          <SidebarGroupLabel inert={rail} className={cn("text-xs font-medium text-muted-foreground", sidebarFade)}>
            Products
          </SidebarGroupLabel>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarGroupAction aria-label="Add a product or section" className={sidebarFade}>
                <Plus />
              </SidebarGroupAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-48">
              <DropdownMenuItem onSelect={() => (close(), openNewProduct())}>
                <Package /> New product
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void newSection()}>
                <Heading /> New section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <SidebarGroupContent>
            {isLoading ? (
              Array.from({ length: 5 }, (_, i) => <SidebarMenuSkeleton key={i} showIcon />)
            ) : live.length === 0 && archived.length === 0 ? (
              <div inert={rail} className={cn("mx-1 mt-1 rounded-lg border border-dashed p-3 text-sm text-muted-foreground", sidebarFade)}>
                Add each app, site, server or tool you work on.
                <Button size="sm" className="mt-3 w-full" onClick={() => (close(), openNewProduct())}>
                  <Plus /> New product
                </Button>
              </div>
            ) : (
              <div ref={boxRef} className="relative">
                <SidebarMenu className="gap-px">{rows}</SidebarMenu>
                {drag?.line != null && <DropLine top={drag.line} />}
              </div>
            )}
            {dragged && (
              <DragGhost ghostRef={ghostRef}>
                {dragged.kind === "product" ? (
                  <>
                    <ProductAvatar name={dragged.p.name} color={dragged.p.color} icon={dragged.p.icon} className="size-5 rounded text-[0.5rem]" />
                    <span className="truncate">{dragged.p.name}</span>
                  </>
                ) : (
                  <span className="truncate text-xs font-medium tracking-wide uppercase">{dragged.name}</span>
                )}
              </DragGhost>
            )}
            {archived.length > 0 && (
              <SidebarMenu className="mt-2 gap-px">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Archived"
                    className={cn(item, "text-muted-foreground")}
                    onClick={() => {
                      const next = !archiveOpen
                      setArchiveOpen(next)
                      try {
                        localStorage.setItem(ARCHIVE_OPEN, next ? "1" : "0")
                      } catch {
                        // Remembered for this visit only.
                      }
                    }}
                  >
                    <Archive />
                    <span className={label}>Archived</span>
                    <span className={cn("ml-auto flex items-center gap-1 text-xs", sidebarFade)}>
                      {archived.length}
                      <ChevronRight className={cn("size-3.5 transition-transform", archiveOpen && "rotate-90")} />
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {archiveOpen && archived.map((p) => productRow(p))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-0 border-t px-2 py-2">
        <SidebarFold when="rail">
          <div className="flex flex-col pb-1 pl-0.5">{search("right")}</div>
        </SidebarFold>
        <div className="@container flex items-center gap-1">
          <UserMenu onNavigate={close} side={rail ? "right" : "top"} />
          <div inert={rail} className={cn("flex", sidebarFade)}>
            {search("top")}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
