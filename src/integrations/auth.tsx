import { LogtoProvider, UserScope, useLogto } from '@logto/react'
import type { LogtoConfig } from '@logto/react'
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react'
import { useCallback, useMemo, useRef, useState } from 'react'

const env = {
  logtoEndpoint: import.meta.env.VITE_LOGTO_ENDPOINT?.trim(),
  logtoAppId: import.meta.env.VITE_LOGTO_APP_ID?.trim(),
  convexUrl: import.meta.env.VITE_CONVEX_URL?.trim(),
}

const missing = Object.entries({
  VITE_LOGTO_ENDPOINT: env.logtoEndpoint,
  VITE_LOGTO_APP_ID: env.logtoAppId,
  VITE_CONVEX_URL: env.convexUrl,
})
  .filter(([, value]) => !value)
  .map(([name]) => name)

const logtoConfig: LogtoConfig = {
  endpoint: env.logtoEndpoint ?? '',
  appId: env.logtoAppId ?? '',
  // `roles` puts the member's Logto roles in the ID token, which Convex reads.
  scopes: [UserScope.Email, UserScope.Profile, UserScope.Roles],
}

export const convex = env.convexUrl ? new ConvexReactClient(env.convexUrl) : null

const RETURN_TO_KEY = 'inventory:returnTo'

export function useSignIn() {
  const { signIn } = useLogto()
  return useCallback(() => {
    sessionStorage.setItem(
      RETURN_TO_KEY,
      window.location.pathname + window.location.search,
    )
    void signIn(`${window.location.origin}/callback`)
  }, [signIn])
}

export function takeReturnTo() {
  const path = sessionStorage.getItem(RETURN_TO_KEY)
  sessionStorage.removeItem(RETURN_TO_KEY)
  // Only allow same-origin paths.
  return path?.startsWith('/') && !path.startsWith('//') ? path : '/'
}

/** Feeds Logto ID tokens to Convex, which validates them against Logto's JWKS. */
function useLogtoForConvex() {
  const logto = useLogto()
  const logtoRef = useRef(logto)
  logtoRef.current = logto

  // useLogto flips isLoading during every token call. Only report the initial
  // load so Convex doesn't treat a token refresh as signing out.
  const [settled, setSettled] = useState(false)
  if (!settled && !logto.isLoading) setSettled(true)

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      const { clearAccessToken, getAccessToken, getIdToken } = logtoRef.current
      if (forceRefreshToken) await clearAccessToken()
      // getAccessToken uses the refresh token when needed, which also rotates
      // the ID token. Read the ID token afterwards so it isn't stale.
      await getAccessToken()
      return (await getIdToken()) ?? null
    },
    [],
  )

  return useMemo(
    () => ({
      isLoading: !settled,
      isAuthenticated: logto.isAuthenticated,
      fetchAccessToken,
    }),
    [settled, logto.isAuthenticated, fetchAccessToken],
  )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (missing.length > 0 || !convex) {
    return (
      <div className="mx-auto max-w-md p-8 text-sm">
        <p className="font-medium">The app isn’t configured.</p>
        <p className="mt-2 text-muted-foreground">
          Missing environment variables: {missing.join(', ')}
        </p>
      </div>
    )
  }
  return (
    <LogtoProvider config={logtoConfig}>
      <ConvexProviderWithAuth client={convex} useAuth={useLogtoForConvex}>
        {children}
      </ConvexProviderWithAuth>
    </LogtoProvider>
  )
}
