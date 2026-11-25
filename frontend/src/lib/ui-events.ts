import type { ItemInput } from "@/lib/api"

/** App-wide dialogs, opened from anywhere without threading callbacks. */

export const openPalette = () => window.dispatchEvent(new Event("docket:palette"))

/** Quick-create an item; defaults prefill the form (product key, due date…). */
export const openNewItem = (defaults: ItemInput = {}) => window.dispatchEvent(new CustomEvent("docket:new-item", { detail: defaults }))

export const openNewProduct = () => window.dispatchEvent(new Event("docket:new-product"))

export function onUiEvent<T>(name: "docket:palette" | "docket:new-item" | "docket:new-product", fn: (detail: T) => void) {
  const handler = (e: Event) => fn((e as CustomEvent<T>).detail)
  window.addEventListener(name, handler)
  return () => window.removeEventListener(name, handler)
}
