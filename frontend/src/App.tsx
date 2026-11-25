import { useEffect, useState, type ComponentType } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Navigate, Route, Routes, useNavigate } from "react-router"

import { AppShell } from "@/components/app-shell"
import { api } from "@/lib/api"
import { loadedScreen, loadScreen, type Screen, type ScreenModule } from "@/routes"

/**
 * A screen whose code loads when it's first shown. One that has already
 * arrived (the app starts fetching the first screen straight away, in
 * lib/boot.ts) renders at once. No React.lazy: see lib/deferred.tsx.
 */
function screen<K extends Screen>(name: K, pick: (m: ScreenModule<K>) => ComponentType = (m) => m.default) {
  return function ScreenRoute() {
    const [, update] = useState(0)
    const m = loadedScreen(name)
    useEffect(() => {
      if (m) return
      let live = true
      // A file that's gone after an update reloads the app (main.tsx).
      loadScreen(name).then(() => live && update((n) => n + 1), () => {})
      return () => {
        live = false
      }
    }, [m])
    if (!m) return <Spinner />
    const Ready = pick(m)
    return <Ready />
  }
}

const HomePage = screen("home")
const InboxPage = screen("inbox")
const BoardPage = screen("board")
const ItemsPage = screen("items")
const CalendarPage = screen("calendar")
const ProductPage = screen("product")
const SectionPage = screen("section")
const TrashPage = screen("trash")
const SettingsPage = screen("settings")
const LoginPage = screen("login")
const SetupPage = screen("setup")

function Spinner() {
  return (
    <div className="grid h-full min-h-40 place-items-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery({ queryKey: ["session"], queryFn: api.session, staleTime: Infinity })
  const navigate = useNavigate()

  // Any API call that comes back 401 means the session ended.
  useEffect(() => {
    const out = () => navigate("/login", { replace: true })
    window.addEventListener("docket:signed-out", out)
    return () => window.removeEventListener("docket:signed-out", out)
  }, [navigate])

  if (isLoading) return <div className="h-svh"><Spinner /></div>
  if (data?.setupRequired) return <Navigate to="/setup" replace />
  if (data && !data.authenticated) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/p/:key/:tab?" element={<ProductPage />} />
        <Route path="/s/:name/:tab?" element={<SectionPage />} />
        <Route path="/trash" element={<TrashPage />} />
        <Route path="/settings/:section?" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
