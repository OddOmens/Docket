import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { cn } from "cn"
import { Bot, Check, Copy, Info, KeyRound, Laptop, Loader2, ShieldCheck, Smartphone, Trash2, UserRound } from "lucide-react"
import { useTheme } from "next-themes"
import QRCode from "qrcode"
import { Navigate, NavLink, useParams } from "react-router"
import { toast } from "sonner"

import { useDialogs } from "@/components/dialogs"
import { HealthList, useWarnings } from "@/components/health"
import { Page } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type ApiToken, type Device } from "@/lib/api"
import { errorMessage, relativeTime } from "@/lib/format"

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b py-7 last:border-b-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

const SECTIONS = [
  { id: "account", label: "Account", icon: UserRound, description: "Your name and how Docket looks." },
  { id: "security", label: "Security", icon: ShieldCheck, description: "How you sign in, and where you're signed in." },
  { id: "api", label: "API & MCP", icon: Bot, description: "Tokens that let Claude and your scripts read and change your work." },
  { id: "about", label: "About", icon: Info, description: "This server and where your data lives." },
] as const

type SectionId = (typeof SECTIONS)[number]["id"]

export default function SettingsPage() {
  const { section = "account" } = useParams()
  const current = SECTIONS.find((x) => x.id === section)
  if (!current) return <Navigate to="/settings" replace />
  return (
    <Page>
      <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10 md:py-14">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">Settings</h1>
        <div className="mt-6 md:mt-8 md:grid md:grid-cols-[12rem_1fr] md:gap-12">
          <nav aria-label="Settings" className="flex flex-wrap gap-1 border-b pb-3 md:sticky md:top-0 md:flex-col md:flex-nowrap md:self-start md:border-b-0 md:pb-0">
            {SECTIONS.map((x) => (
              <NavLink
                key={x.id}
                to={x.id === "account" ? "/settings" : `/settings/${x.id}`}
                end
                className={({ isActive }) =>
                  cn(
                    "flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&>svg]:size-4",
                    (isActive || x.id === section) && "bg-accent font-medium text-foreground",
                  )
                }
              >
                <x.icon /> {x.label}
              </NavLink>
            ))}
          </nav>
          <div className="min-w-0 pt-6 md:pt-0">
            <header className="border-b pb-5">
              <h2 className="text-lg font-semibold tracking-tight">{current.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
            </header>
            <SettingsSection id={current.id} />
          </div>
        </div>
      </div>
    </Page>
  )
}

function SettingsSection({ id }: { id: SectionId }) {
  const { data: account } = useQuery({ queryKey: ["account"], queryFn: api.account })
  const { data: session } = useQuery({ queryKey: ["session"], queryFn: api.session, staleTime: Infinity })
  switch (id) {
    case "account":
      return (
        <>
          <Section title="Profile" description="Your name appears in greetings and on your devices.">
            {account && <ProfileForm name={account.name} />}
          </Section>
          <Section title="Appearance">
            <ThemePicker />
          </Section>
        </>
      )
    case "security":
      return (
        <>
          <Section title="Password" description="Changing it signs out your other devices and revokes every API token.">
            <PasswordForm />
          </Section>
          <Section title="Two-factor sign-in" description="Ask for a code from an authenticator app as well as your password.">
            {account && <TwoFactor enabled={account.twoFactor} recoveryLeft={account.recoveryCodes} />}
          </Section>
          <Section title="Devices" description="Browsers and apps signed in to Docket. Sign out any you don't recognise.">
            <Devices />
          </Section>
        </>
      )
    case "api":
      return <ApiSection />
    case "about":
      return (
        <>
          <Section title="Health" description="Things that keep your work safe, checked each time you open this page.">
            <Health />
          </Section>
          <Section title="Version">
            <p className="text-sm">Docket {session?.version ?? ""}</p>
          </Section>
          <Section title="Your data">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-muted-foreground">Database</dt>
              <dd>Products, items, comments, history, your account and API tokens live in one SQLite file in the data folder. Back up that folder.</dd>
              <dt className="text-muted-foreground">Tokens</dt>
              <dd>Only a hash of each API token is stored. A lost token can't be shown again; make a new one.</dd>
            </dl>
          </Section>
        </>
      )
  }
}

function Health() {
  const warnings = useWarnings()
  if (!warnings) return <Skeleton className="h-10 rounded-lg" />
  return <HealthList warnings={warnings} empty="Nothing needs your attention." />
}

function ProfileForm({ name }: { name: string }) {
  const [value, setValue] = useState(name)
  const qc = useQueryClient()
  useEffect(() => setValue(name), [name])
  return (
    <form
      className="flex max-w-sm gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await api.updateAccount({ name: value })
          qc.invalidateQueries({ queryKey: ["account"] })
          toast.success("Saved")
        } catch (err) {
          toast.error(errorMessage(err))
        }
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Name" maxLength={60} />
      <Button type="submit" variant="outline" disabled={!value.trim() || value.trim() === name}>
        Save
      </Button>
    </form>
  )
}

function ThemePicker() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="flex gap-2">
      {[
        { v: "light", label: "Light" },
        { v: "dark", label: "Dark" },
        { v: "system", label: "System" },
      ].map((o) => (
        <Button key={o.v} variant={theme === o.v ? "default" : "outline"} size="sm" onClick={() => setTheme(o.v)}>
          {o.label}
        </Button>
      ))}
    </div>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const mismatch = confirm.length > 0 && next !== confirm
  return (
    <form
      className="grid max-w-sm gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await api.changePassword(current, next)
          setCurrent("")
          setNext("")
          setConfirm("")
          qc.invalidateQueries({ queryKey: ["sessions"] })
          toast.success("Password changed. Other devices were signed out and API tokens revoked.")
        } catch (err) {
          toast.error(errorMessage(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="pw-current">Current password</Label>
        <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-next">New password</Label>
        <Input id="pw-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={10} />
        <p className="text-xs text-muted-foreground">At least 10 characters. A passphrase of a few words works well.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-confirm">Confirm new password</Label>
        <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
        {mismatch && <p className="text-xs text-destructive">The passwords don't match.</p>}
      </div>
      <Button type="submit" className="justify-self-start" disabled={busy || !current || next.length < 10 || next !== confirm}>
        Change password
      </Button>
    </form>
  )
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border bg-surface p-4 font-mono text-sm">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => {
          void navigator.clipboard?.writeText(codes.join("\n"))
          setCopied(true)
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy codes"}
      </Button>
    </div>
  )
}

function TwoFactor({ enabled, recoveryLeft }: { enabled: boolean; recoveryLeft: number }) {
  const qc = useQueryClient()
  const [step, setStep] = useState<"idle" | "password" | "scan" | "codes" | "disable" | "regen">("idle")
  const [password, setPassword] = useState("")
  const [secret, setSecret] = useState<{ secret: string; uri: string } | null>(null)
  const [qr, setQr] = useState("")
  const [code, setCode] = useState("")
  const [codes, setCodes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (secret) void QRCode.toDataURL(secret.uri, { margin: 1, width: 200 }).then(setQr)
  }, [secret])

  const close = () => {
    setStep("idle")
    setPassword("")
    setCode("")
    setSecret(null)
    setQr("")
    qc.invalidateQueries({ queryKey: ["account"] })
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 text-sm">
        {enabled ? (
          <>
            <ShieldCheck className="size-4 text-green-600 dark:text-green-400" /> On.{" "}
            <span className="text-muted-foreground">
              {recoveryLeft} recovery {recoveryLeft === 1 ? "code" : "codes"} left.
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Off.</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setStep("regen")}>
              New recovery codes
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStep("disable")}>
              Turn off
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setStep("password")}>
            Set up
          </Button>
        )}
      </div>

      <Dialog open={step !== "idle"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          {(step === "password" || step === "disable" || step === "regen") && (
            <form
              className="grid gap-5"
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  if (step === "password") {
                    setSecret(await api.startTwoFactor(password))
                    setStep("scan")
                  } else if (step === "disable") {
                    await api.disableTwoFactor(password)
                    toast.success("Two-factor sign-in is off")
                    close()
                  } else {
                    setCodes((await api.newRecoveryCodes(password)).recoveryCodes)
                    setStep("codes")
                  }
                })
              }}
            >
              <DialogHeader>
                <DialogTitle>{step === "disable" ? "Turn off two-factor sign-in" : step === "regen" ? "New recovery codes" : "Set up two-factor sign-in"}</DialogTitle>
                <DialogDescription>Enter your password to continue.</DialogDescription>
              </DialogHeader>
              <Input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" variant={step === "disable" ? "destructive" : "default"} disabled={!password || busy}>
                  Continue
                </Button>
              </DialogFooter>
            </form>
          )}
          {step === "scan" && secret && (
            <form
              className="grid gap-5"
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  setCodes((await api.enableTwoFactor(code)).recoveryCodes)
                  setStep("codes")
                })
              }}
            >
              <DialogHeader>
                <DialogTitle>Scan with your authenticator app</DialogTitle>
                <DialogDescription>Use 1Password, Google Authenticator, Authy or similar, then enter the 6-digit code it shows.</DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-4">
                <div className="grid size-[200px] shrink-0 place-items-center rounded-lg border bg-white p-1">
                  {qr ? <img src={qr} alt="QR code for your authenticator app" className="size-full" /> : <Loader2 className="size-5 animate-spin text-muted-foreground" />}
                </div>
                <div className="min-w-0 text-xs text-muted-foreground">
                  Can't scan? Enter this key:
                  <code className="mt-1 block font-mono text-[0.7rem] break-all text-foreground">{secret.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
                </div>
              </div>
              <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus>
                <InputOTPGroup>
                  {Array.from({ length: 6 }, (_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={code.length !== 6 || busy}>
                  Turn on
                </Button>
              </DialogFooter>
            </form>
          )}
          {step === "codes" && (
            <div className="grid gap-5">
              <DialogHeader>
                <DialogTitle>Save your recovery codes</DialogTitle>
                <DialogDescription>
                  If you lose your authenticator, each code signs you in once. Keep them somewhere safe; they won't be shown again.
                </DialogDescription>
              </DialogHeader>
              <RecoveryCodes codes={codes} />
              <DialogFooter>
                <Button onClick={close}>I've saved them</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function describe(d: Device) {
  const ua = d.userAgent
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : ""
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : ""
  const mobile = /iPhone|Android|Mobile/.test(ua)
  const name = d.device !== "Browser" ? d.device : [browser, os].filter(Boolean).join(" on ") || "Browser"
  return { name, mobile }
}

function Devices() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["sessions"], queryFn: api.sessions })
  const others = (data ?? []).filter((d) => !d.current).length
  const revoke = async (id?: string) => {
    try {
      await (id ? api.revokeSession(id) : api.revokeOtherSessions())
      qc.invalidateQueries({ queryKey: ["sessions"] })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <div className="grid gap-3">
      <div className="divide-y rounded-lg border">
        {data?.map((d) => {
          const { name, mobile } = describe(d)
          const Icon = mobile ? Smartphone : Laptop
          return (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{name}</span>
                  {d.current && <Badge variant="secondary">This device</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {d.ip} · active {relativeTime(d.lastSeen * 1000)} · signed in {new Date(d.created * 1000).toLocaleDateString()}
                </div>
              </div>
              {!d.current && (
                <Button variant="ghost" size="sm" onClick={() => void revoke(d.id)}>
                  Sign out
                </Button>
              )}
            </div>
          )
        })}
      </div>
      {others > 0 && (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => void revoke()}>
          Sign out all other devices
        </Button>
      )}
    </div>
  )
}


const EXPIRY = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
  { days: 0, label: "Never" },
]

function CopyBlock({ text, label, secret }: { text: string; label: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className={cn("overflow-x-auto rounded-lg border bg-surface px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all", secret && "select-all")}>{text}</pre>
    </div>
  )
}

/** API tokens for Claude (over MCP) and scripts (over REST). */
function ApiSection() {
  const qc = useQueryClient()
  const { confirm } = useDialogs()
  const { data: tokens, isLoading } = useQuery({ queryKey: ["tokens"], queryFn: api.tokens })
  const [name, setName] = useState("Claude")
  const [scope, setScope] = useState<"read" | "write">("write")
  const [days, setDays] = useState(90)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ token: string; info: ApiToken } | null>(null)
  const origin = location.origin

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      setCreated(await api.createToken(name, scope, days, password))
      setPassword("")
      qc.invalidateQueries({ queryKey: ["tokens"] })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Section
        title="How it works"
        description="Each token acts as you, with the access you give it. Activity made with a token is labelled with the token's name, so you can see what Claude changed."
      >
        <ul className="grid gap-1.5 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">MCP</span> at <code className="rounded bg-muted px-1 font-mono text-xs">{origin}/mcp</code>: tools to list, search, create and update products, items, comments and milestones.
          </li>
          <li>
            <span className="font-medium text-foreground">REST</span> at <code className="rounded bg-muted px-1 font-mono text-xs">{origin}/api/…</code> with <code className="rounded bg-muted px-1 font-mono text-xs">Authorization: Bearer &lt;token&gt;</code>.
          </li>
          <li>Tokens can't change your password, sessions or other tokens. Read tokens can't change anything.</li>
        </ul>
      </Section>
      <Section title="New token">
        <form className="grid max-w-md gap-3" onSubmit={create}>
          <div className="grid gap-1.5">
            <Label htmlFor="tok-name">Name</Label>
            <Input id="tok-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Claude" />
            <p className="text-xs text-muted-foreground">Shown in activity, as in “Claude changed status”.</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Access</Label>
            <div className="flex gap-2">
              {(["write", "read"] as const).map((s) => (
                <Button key={s} type="button" size="sm" variant={scope === s ? "default" : "outline"} onClick={() => setScope(s)}>
                  {s === "write" ? "Read and write" : "Read only"}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Expires</Label>
            <div className="flex flex-wrap gap-2">
              {EXPIRY.map((x) => (
                <Button key={x.days} type="button" size="sm" variant={days === x.days ? "default" : "outline"} onClick={() => setDays(x.days)}>
                  {x.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tok-password">Your password</Label>
            <Input id="tok-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="justify-self-start" disabled={busy || !name.trim() || !password}>
            <KeyRound /> Create token
          </Button>
        </form>
      </Section>
      <Section title="Tokens">
        {isLoading ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : !tokens?.length ? (
          <p className="text-sm text-muted-foreground">No tokens yet.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {tokens.map((t) => {
              const expired = t.expires > 0 && t.expires * 1000 < Date.now()
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{t.name}</span>
                      <Badge variant="secondary">{t.scope === "write" ? "Read and write" : "Read only"}</Badge>
                      {expired && <Badge variant="destructive">Expired</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      …{t.hint} · {t.lastUsed ? `used ${relativeTime(t.lastUsed * 1000)}` : "never used"} · {t.expires ? `expires ${new Date(t.expires * 1000).toLocaleDateString()}` : "never expires"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (!(await confirm({ title: `Revoke “${t.name}”?`, description: "Anything using it stops working at once.", confirm: "Revoke", destructive: true }))) return
                      try {
                        await api.deleteToken(t.id)
                        qc.invalidateQueries({ queryKey: ["tokens"] })
                      } catch (e) {
                        toast.error(errorMessage(e))
                      }
                    }}
                  >
                    <Trash2 /> Revoke
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </Section>
      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Your new token</DialogTitle>
            <DialogDescription>Copy it now: it's shown only once. Treat it like a password; don't paste it into chats or commit it.</DialogDescription>
          </DialogHeader>
          {created && (
            <div className="grid min-w-0 gap-4">
              <CopyBlock label="Token" text={created.token} secret />
              <CopyBlock label="Add to Claude Code" text={`claude mcp add --transport http docket ${origin}/mcp --header "Authorization: Bearer ${created.token}"`} secret />
              <CopyBlock label="Try the REST API" text={`curl -H "Authorization: Bearer ${created.token}" ${origin}/api/items?product=KEY`} secret />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
