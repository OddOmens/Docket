import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { BrowserRouter } from "react-router"

import App from "@/App"
import { DialogsProvider } from "@/components/dialogs"
import { ThemeColor } from "@/components/theme-color"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { queryClient } from "@/lib/boot"
import { watchKeyboard } from "@/lib/keyboard"
import "./index.css"

// After an update the server only has the new build's files, so a tab opened
// before it can't load lazy parts (screens). Reload once to pick up the new
// build; the timestamp stops a loop if the file is really missing.
window.addEventListener("vite:preloadError", (event) => {
  let last = 0
  try {
    last = Number(sessionStorage.getItem("docket:reloaded-at")) || 0
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem("docket:reloaded-at", String(Date.now()))
  } catch {
    // No session storage: still reload, but only this once per tab.
    if ((window as { docketReloaded?: boolean }).docketReloaded) return
    ;(window as { docketReloaded?: boolean }).docketReloaded = true
  }
  event.preventDefault()
  window.location.reload()
})

watchKeyboard()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ThemeColor />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TooltipProvider delayDuration={400}>
            <DialogsProvider>
              <App />
              <Toaster position="bottom-right" />
            </DialogsProvider>
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
