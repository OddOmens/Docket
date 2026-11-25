import { QueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { whenIdle } from "@/lib/idle"
import { restoreShell, wasSignedIn } from "@/lib/shell-cache"
import { loadScreen, screenFor } from "@/routes"

/**
 * Starts everything the first screen needs at once, before React renders:
 * the session check, the screen's code, and the data the sidebar asks for.
 * The keys and fetchers are the components' own, so they find the answers
 * (or the request still under way) instead of asking again.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
})

restoreShell(queryClient)

// staleTime 0: ask even when a copy from the last visit is in the cache.
const fetch = <T>(queryKey: unknown[], queryFn: () => Promise<T>) => void queryClient.prefetchQuery({ queryKey, queryFn, staleTime: 0 })

const screen = screenFor(location.pathname)
if (screen) void loadScreen(screen).catch(() => {})

if (!wasSignedIn() && screen !== "login" && screen !== "setup") void loadScreen("login").catch(() => {})
fetch(["session"], api.session)
if (wasSignedIn() && screen !== "login" && screen !== "setup") {
  fetch(["products"], api.products)
  fetch(["account"], api.account)
  fetch(["overview"], api.overview)
  const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData
  if (!saveData) {
    whenIdle(() => {
      for (const next of ["home", "board", "product", "items"] as const) if (next !== screen) void loadScreen(next).catch(() => {})
    }, 4000)
  }
}
