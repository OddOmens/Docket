import { ApiError, Unreachable } from "@/lib/api"

export function errorMessage(e: unknown) {
  if (e instanceof ApiError || e instanceof Unreachable) return e.message
  return e instanceof Error ? e.message : "Something went wrong"
}

/** "3m ago", "yesterday", "12 Nov". ms: a time in milliseconds. */
export function relativeTime(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 45) return "just now"
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  if (s < 2 * 86400) return "yesterday"
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() && { year: "numeric" }) })
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const pad = (n: number) => String(n).padStart(2, "0")

/** A local date as YYYY-MM-DD. */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const today = () => isoDate(new Date())

/** Parses YYYY-MM-DD as a local date. */
export function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(s: string, n: number) {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

/** Days from today to s: negative is past. */
export function daysFromToday(s: string) {
  return Math.round((parseDate(s).getTime() - parseDate(today()).getTime()) / 86400000)
}

/** "Today", "Tomorrow", "Fri 21 Nov", "21 Nov 2027". */
export function formatDue(s: string) {
  if (!s) return ""
  const n = daysFromToday(s)
  if (n === 0) return "Today"
  if (n === 1) return "Tomorrow"
  if (n === -1) return "Yesterday"
  const d = parseDate(s)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  if (n > 1 && n < 7) return d.toLocaleDateString(undefined, { weekday: "short" })
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(!sameYear && { year: "numeric" }) })
}

export function formatDate(s: string) {
  if (!s) return ""
  return parseDate(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
}

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`
