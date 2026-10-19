import { useRef } from 'react'
import { useQuery } from 'convex/react'
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import { convex } from '#/integrations/auth'

type Query = FunctionReference<'query'>

// Convex rejects queries until the member's token is attached, so loaders only
// warm queries once the app shell has mounted inside <Authenticated>.
let ready = false
export function setQueriesReady(value: boolean) {
  ready = value
}

// Long enough for the page to mount and take over the subscription.
const HOLD_MS = 10_000
// Past this, show the page and let it finish loading on its own.
const MAX_WAIT_MS = 3_000

/**
 * Subscribes to a query and resolves with its first result. Route loaders
 * await this so the next page renders with its data instead of blank, since
 * `useQuery` reads an already-subscribed result synchronously.
 */
export function loadQuery<TQuery extends Query>(
  query: TQuery,
  args: FunctionArgs<TQuery>,
): Promise<FunctionReturnType<TQuery> | undefined> {
  if (!ready || !convex) return Promise.resolve(undefined)
  const watch = convex.watchQuery(query, args)
  return new Promise((resolve) => {
    let settled = false
    const settle = (value: FunctionReturnType<TQuery> | undefined) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
      setTimeout(unsubscribe, HOLD_MS)
    }
    const check = () => {
      try {
        const value = watch.localQueryResult()
        if (value !== undefined) settle(value)
      } catch {
        // The page's own useQuery surfaces the error.
        settle(undefined)
      }
    }
    const timeout = setTimeout(() => settle(undefined), MAX_WAIT_MS)
    const unsubscribe = watch.onUpdate(check)
    check()
  })
}

/**
 * Like `useQuery`, but keeps showing the previous result while new arguments
 * load, so lists and panels don't blink empty on every change.
 */
export function useStableQuery<TQuery extends Query>(
  query: TQuery,
  args: FunctionArgs<TQuery> | 'skip',
): FunctionReturnType<TQuery> | undefined {
  const result = useQuery(query, args)
  const last = useRef(result)
  if (result !== undefined) last.current = result
  return args === 'skip' ? undefined : last.current
}
