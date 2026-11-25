import { cn } from "cn"

/** Docket's mark: Lucide's list-todo (ISC licence), as on the app icon. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-6", className)} aria-hidden>
      {/* Black with a white glyph in both themes; the hairline keeps the plate's edge visible on dark surfaces. */}
      <rect x=".5" y=".5" width="31" height="31" rx="6.5" fill="#000" className="stroke-black dark:stroke-white/15" />
      <g transform="translate(6 6) scale(.8333)" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 5h8M13 12h8M13 19h8" />
        <path d="m3 17 2 2 4-4" />
        <rect x="3" y="4" width="6" height="6" rx="1" />
      </g>
    </svg>
  )
}

export function Brand({ className }: { className?: string }) {
  return (
    <span data-brand className={cn("flex items-center gap-2", className)}>
      <Logo />
      <span className="text-[0.95rem] font-semibold tracking-[-0.01em]">Docket</span>
    </span>
  )
}
