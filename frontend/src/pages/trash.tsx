import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RotateCcw, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { TypeIcon } from "@/components/badges"
import { useDialogs } from "@/components/dialogs"
import { Page } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { invalidateWork } from "@/hooks/use-data"
import { api } from "@/lib/api"
import { errorMessage, relativeTime } from "@/lib/format"

export default function TrashPage() {
  const qc = useQueryClient()
  const { confirm } = useDialogs()
  const { data, isLoading } = useQuery({ queryKey: ["trash"], queryFn: api.trash })
  const items = data?.items ?? []
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn()
      invalidateWork(qc)
      if (done) toast.success(done)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <Page
      header={
        <>
          <h1 className="text-base font-semibold">Trash</h1>
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={async () => {
                if (await confirm({ title: "Empty the trash?", description: `${items.length} items will be deleted for good, with their comments and history.`, confirm: "Empty trash", destructive: true }))
                  void run(api.emptyTrash, "Trash emptied")
              }}
            >
              <Trash2 /> Empty trash
            </Button>
          )}
        </>
      }
    >
      <div className="mx-auto grid w-full max-w-4xl gap-3 px-3 py-4 md:px-5">
        <p className="text-sm text-muted-foreground">Deleted items stay here for 30 days, then they're removed for good.</p>
        {isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">The trash is empty.</p>
        ) : (
          <div className="divide-y rounded-xl border bg-card">
            {items.map((it) => (
              <div key={it.id} className="flex min-h-11 items-center gap-2 px-3 py-1.5 text-sm">
                <TypeIcon type={it.type} className="size-3.5" />
                <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{it.ref}</span>
                <span className="min-w-0 flex-1 truncate">{it.title}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {it.productName} · deleted {relativeTime((it.deletedAt ?? 0) * 1000)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => void run(() => api.restoreItem(it.ref), `Restored ${it.ref}`)}>
                  <RotateCcw /> Restore
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete for good"
                  onClick={async () => {
                    if (await confirm({ title: `Delete ${it.ref} for good?`, description: "This can't be undone.", confirm: "Delete", destructive: true })) void run(() => api.purgeItem(it.ref))
                  }}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Page>
  )
}
