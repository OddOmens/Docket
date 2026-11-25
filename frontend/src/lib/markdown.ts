import DOMPurify from "dompurify"
import { marked } from "marked"

marked.setOptions({ gfm: true, breaks: true })

// Links open in a new tab and never send the page along.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank")
    node.setAttribute("rel", "noopener noreferrer")
  }
  if (node.tagName === "INPUT") node.removeAttribute("disabled")
})

/**
 * Markdown to safe HTML. Task list checkboxes get data-task="n", their order
 * in the text, so a click can tick the right line (toggleTask).
 */
export function renderMarkdown(src: string) {
  const html = marked.parse(src, { async: false }) as string
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ["target"], FORBID_TAGS: ["style", "form", "iframe"], FORBID_ATTR: ["style"] })
  let n = 0
  return clean.replace(/<input([^>]*?)type="checkbox"([^>]*)>/g, (_m, a: string, b: string) => `<input${a}type="checkbox"${b} data-task="${n++}">`)
}

const TASK = /^(\s*[-*+]\s+\[)([ xX])(\]\s)/

/** Ticks or unticks the nth task line ("- [ ] …") in src. */
export function toggleTask(src: string, n: number) {
  const lines = src.split("\n")
  let seen = 0
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence
    if (fence) continue
    const m = TASK.exec(lines[i])
    if (!m) continue
    if (seen++ === n) {
      lines[i] = lines[i].replace(TASK, (_x, a: string, c: string, b: string) => a + (c === " " ? "x" : " ") + b)
      break
    }
  }
  return lines.join("\n")
}
