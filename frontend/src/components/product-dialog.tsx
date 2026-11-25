import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { emptyProduct, ProductFields, type ProductDraft } from "@/components/product-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { invalidateWork } from "@/hooks/use-data"
import { api } from "@/lib/api"
import { errorMessage } from "@/lib/format"
import { onUiEvent } from "@/lib/ui-events"

export function NewProductDialog() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ProductDraft>(emptyProduct)
  const [keyTouched, setKeyTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const navigate = useNavigate()
  useEffect(
    () =>
      onUiEvent("docket:new-product", () => {
        setDraft({ ...emptyProduct, color: emptyProduct.color })
        setKeyTouched(false)
        setOpen(true)
      }),
    [],
  )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>An app, site, server, tool or anything else you keep work for.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              const { links: _links, ...rest } = draft
              const p = await api.createProduct({ ...rest, key: draft.key || undefined })
              invalidateWork(qc)
              setOpen(false)
              navigate(`/p/${encodeURIComponent(p.key)}`)
              toast.success(`Created ${p.name}`)
            } catch (err) {
              toast.error(errorMessage(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          <ProductFields value={draft} onChange={setDraft} keyTouched={keyTouched} onKeyTouched={() => setKeyTouched(true)} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!draft.name.trim() || busy}>
              Create product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
