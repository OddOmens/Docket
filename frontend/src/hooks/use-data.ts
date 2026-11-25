import { useCallback, useEffect } from "react"
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { api, clientId, type Item, type ItemFilter, type ItemInput, type ItemList } from "@/lib/api"
import { errorMessage } from "@/lib/format"

export const useProducts = () => useQuery({ queryKey: ["products"], queryFn: api.products })
export const useProduct = (key: string) => useQuery({ queryKey: ["product", key], queryFn: () => api.product(key), enabled: !!key })
export const useOverview = () => useQuery({ queryKey: ["overview"], queryFn: api.overview })
export const useItems = (f: ItemFilter, enabled = true) => useQuery({ queryKey: ["items", f], queryFn: () => api.items(f), enabled, placeholderData: (prev) => prev })
export const useItem = (ref: string) => useQuery({ queryKey: ["item", ref], queryFn: () => api.item(ref), enabled: !!ref, retry: false })
export const useMilestones = (product?: string, enabled = true) =>
  useQuery({ queryKey: ["milestones", product ?? ""], queryFn: () => api.milestones(product), enabled })
export const useLabels = () => useQuery({ queryKey: ["labels"], queryFn: api.labels, staleTime: 60_000 })
export const useGroups = () => useQuery({ queryKey: ["groups"], queryFn: api.groups, staleTime: 60_000 })

/** Everything that shows items or counts of them. */
export function invalidateWork(qc: QueryClient) {
  for (const k of ["items", "item", "overview", "products", "product", "milestones", "labels", "activity", "calendar", "trash", "groups", "search"]) {
    void qc.invalidateQueries({ queryKey: [k] })
  }
}

/** Puts the changed item into every cached item list straight away. */
function patchLists(qc: QueryClient, ref: string, patch: Partial<Item>) {
  qc.setQueriesData<ItemList>({ queryKey: ["items"] }, (old) =>
    old ? { ...old, items: old.items.map((it) => (it.ref === ref ? { ...it, ...patch } : it)) } : old,
  )
}

/** Changes an item, showing the change before the server answers. */
export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ref, input }: { ref: string; input: ItemInput }) => api.updateItem(ref, input),
    onMutate: async ({ ref, input }) => {
      await qc.cancelQueries({ queryKey: ["items"] })
      const patch: Partial<Item> = {}
      for (const k of ["type", "title", "body", "status", "severity", "labels", "startDate", "due", "position"] as const) {
        if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k]
      }
      const saved = qc.getQueriesData<ItemList>({ queryKey: ["items"] })
      patchLists(qc, ref, patch)
      return { saved }
    },
    onError: (e, _v, ctx) => {
      ctx?.saved.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error(errorMessage(e))
    },
    onSuccess: (item, { ref }) => {
      patchLists(qc, ref, item)
      if (item.ref !== ref) qc.removeQueries({ queryKey: ["item", ref] })
    },
    onSettled: () => invalidateWork(qc),
  })
}

/** Opens an item's sheet over the current screen (?item=REF), or closes it. */
export function useItemSheet() {
  const [params, setParams] = useSearchParams()
  const current = params.get("item") ?? ""
  const open = useCallback(
    (ref: string | null, replace = false) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p)
          if (ref) next.set("item", ref)
          else next.delete("item")
          return next
        },
        { replace },
      ),
    [setParams],
  )
  return { current, open }
}

type ChangeEvent = { type: string; kinds?: string[]; origin?: string }

/** Refreshes what's on screen when something changes elsewhere: another tab, or Claude over MCP. */
export function useLiveUpdates() {
  const qc = useQueryClient()
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const es = new EventSource("/api/events")
    es.onmessage = (m) => {
      let e: ChangeEvent
      try {
        e = JSON.parse(m.data)
      } catch {
        return
      }
      if (e.origin && e.origin === clientId) return
      // A burst of changes (an assistant adding ten items) refreshes once.
      clearTimeout(timer)
      timer = setTimeout(() => invalidateWork(qc), 150)
    }
    return () => {
      clearTimeout(timer)
      es.close()
    }
  }, [qc])
}
