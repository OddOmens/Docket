import { useMemo } from "react"
import { cn } from "cn"

import { renderMarkdown } from "@/lib/markdown"

/** Rendered Markdown. onToggleTask: a task checkbox was clicked (its index among the text's tasks). */
export function Markdown({ text, className, onToggleTask }: { text: string; className?: string; onToggleTask?: (n: number) => void }) {
  const html = useMemo(() => renderMarkdown(text), [text])
  return (
    <div
      className={cn("md", className)}
      onClick={(e) => {
        const el = e.target as HTMLElement
        if (el instanceof HTMLInputElement && el.dataset.task !== undefined) {
          e.preventDefault()
          e.stopPropagation()
          if (onToggleTask) onToggleTask(Number(el.dataset.task))
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
