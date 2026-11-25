import { cn } from "cn"

/** The bar across the top of a page's content. */
export function PageHeader({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <header data-bar="page" className={cn("flex h-12 shrink-0 items-center gap-2 border-b px-3 md:h-14 md:px-5", className)}>{children}</header>
}

/** A scrolling page with an optional header. */
export function Page({ header, children, className }: { header?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {header && <PageHeader>{header}</PageHeader>}
      <div className={cn("min-h-0 flex-1 overflow-y-auto max-md:pb-(--sab)", className)}>{children}</div>
    </div>
  )
}

/** A page title with an optional line under it. */
export function PageTitle({ title, children, actions }: { title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em]">{title}</h1>
        {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
