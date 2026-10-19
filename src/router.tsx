import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { PageLoading } from '#/components/app-shell'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Loaders warm each page's queries, so the current page stays up until the
    // next one is ready. Only a slow load swaps in the placeholder.
    defaultPendingComponent: PageLoading,
    defaultPendingMs: 800,
    defaultPendingMinMs: 300,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
