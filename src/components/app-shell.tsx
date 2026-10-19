import { useEffect, useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useLogto } from '@logto/react'
import {
  AuthLoading,
  Authenticated,
  Unauthenticated,
  useMutation,
  useQuery,
} from 'convex/react'
import { LogOut } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useSignIn } from '#/integrations/auth'
import { setQueriesReady } from '#/lib/queries'
import { cn } from '#/lib/utils'

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-sm space-y-4">{children}</div>
    </div>
  )
}

/** A spinner that only appears if loading takes long enough to notice. */
export function PageLoading({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'grid place-items-center',
        fullScreen ? 'min-h-dvh' : 'py-24',
      )}
    >
      <div className="animate-in fill-mode-both fade-in delay-400 duration-300">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground motion-reduce:animate-none" />
      </div>
    </div>
  )
}

/** A thin bar under the header while the router loads the next page. */
function NavigationProgress() {
  const loading = useRouterState({ select: (s) => s.status === 'pending' })
  // Stay hidden for quick navigations so the bar never just flickers.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!loading) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), 150)
    return () => clearTimeout(timer)
  }, [loading])
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="h-full w-1/3 animate-[progress_1.1s_ease-in-out_infinite] bg-primary" />
    </div>
  )
}

function SignInScreen() {
  const signIn = useSignIn()
  return (
    <Centered>
      <h1 className="text-xl font-semibold">IEEE Project Space Inventory</h1>
      <p className="text-sm text-muted-foreground">
        Find parts, check things out, and keep the space organized.
      </p>
      <Button size="lg" onClick={signIn}>
        Sign in with IEEE account
      </Button>
    </Centered>
  )
}

/** Shows the app once both Logto and Convex agree the member is signed in. */
export function AuthGate() {
  const { isAuthenticated, isLoading, signOut } = useLogto()
  const loading = <PageLoading fullScreen />

  if (!isAuthenticated) return isLoading ? loading : <SignInScreen />
  return (
    <>
      <AuthLoading>{loading}</AuthLoading>
      <Authenticated>
        <AppShell />
      </Authenticated>
      <Unauthenticated>
        <Centered>
          <p className="text-sm">
            You’re signed in, but the inventory server didn’t accept your
            session.
          </p>
          <Button onClick={() => void signOut(window.location.origin)}>
            Sign out and try again
          </Button>
        </Centered>
      </Unauthenticated>
    </>
  )
}

const navLinkClass =
  'rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground'

function AppShell() {
  const me = useQuery(api.users.me)
  const sync = useMutation(api.users.sync)
  const { signOut } = useLogto()
  // The rendered page's path. Unlike useLocation, this only changes once the
  // next page has loaded and replaces the current one.
  const pathname = useRouterState({ select: (s) => s.matches.at(-1)?.pathname })

  useEffect(() => {
    void sync()
  }, [sync])

  useEffect(() => {
    setQueriesReady(true)
    return () => setQueriesReady(false)
  }, [])

  // Wait for the profile so the nav doesn't reshuffle when Manage appears.
  if (me === undefined) return <PageLoading fullScreen />

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <NavigationProgress />
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4">
          <Link to="/" className="mr-3 font-semibold tracking-tight">
            Inventory
          </Link>
          <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
            <Link
              to="/"
              className={navLinkClass}
              activeOptions={{ exact: true }}
            >
              Find
            </Link>
            <Link to="/space" className={navLinkClass}>
              Space
            </Link>
            <Link to="/me" className={navLinkClass}>
              My items
            </Link>
            {me.isOfficer && (
              <Link to="/manage" className={navLinkClass}>
                Manage
              </Link>
            )}
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full bg-secondary text-xs font-semibold"
                aria-label="Account"
              >
                {me.name.slice(0, 1).toUpperCase()}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-normal">
                <div className="font-medium">{me.name}</div>
                <div className="text-xs text-muted-foreground">
                  {me.isOfficer ? 'Officer' : 'Member'}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void signOut(window.location.origin)}
              >
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Keyed by path so each page eases in instead of popping. */}
        <div
          key={pathname}
          className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none"
        >
          <Outlet />
        </div>
      </main>
    </div>
  )
}
