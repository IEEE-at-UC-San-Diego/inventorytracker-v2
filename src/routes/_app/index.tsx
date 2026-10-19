import { useDeferredValue, useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Search } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { LocationText } from '#/components/location'
import { PartFormButton } from '#/components/part-form'
import { Input } from '#/components/ui/input'
import { loadQuery, useStableQuery } from '#/lib/queries'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/_app/')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
  }),
  // Read search from the location rather than loaderDeps so typing doesn't
  // block on the loader; useStableQuery covers updates within the page.
  loader: ({ location, cause }) => {
    // Typing updates the URL on every keystroke; the page handles those itself.
    if (cause === 'stay') return
    const { q } = location.search as { q?: string }
    return Promise.all([
      loadQuery(api.parts.search, { query: q ?? '' }),
      loadQuery(api.users.me, {}),
    ])
  },
  component: FindPage,
})

function FindPage() {
  const { q } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [text, setText] = useState(q ?? '')
  const query = useDeferredValue(text)
  const results = useStableQuery(api.parts.search, { query })
  const me = useQuery(api.users.me)

  // Keep the query in the URL so back/forward and sharing work.
  useEffect(() => {
    void navigate({ search: { q: query || undefined }, replace: true })
  }, [query, navigate])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            type="search"
            placeholder="Search parts, e.g. “10k”, “arduino”, “heat shrink”"
            className="h-11 pl-9 text-base"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {me?.isOfficer && (
          <div className="flex items-center">
            <PartFormButton />
          </div>
        )}
      </div>

      {results === undefined ? null : results.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {query ? `Nothing matches “${query}”.` : 'No parts yet.'}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {results.map(({ part, total, available, low, locations }) => (
            <li key={part._id} className="flex items-start gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  to="/parts/$partId"
                  params={{ partId: part._id }}
                  className="font-medium hover:underline"
                >
                  {part.name}
                </Link>
                {part.category && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {part.category}
                  </span>
                )}
                <div className="mt-1 space-y-0.5 text-sm">
                  {locations.length === 0 ? (
                    <span className="text-muted-foreground">No location set</span>
                  ) : (
                    locations.slice(0, 3).map(({ location }) => (
                      <div key={location.drawerId}>
                        <LocationText location={location} />
                      </div>
                    ))
                  )}
                  {locations.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{locations.length - 3} more
                    </div>
                  )}
                </div>
              </div>
              <div
                className={cn(
                  'shrink-0 text-right text-sm tabular-nums',
                  low ? 'font-medium text-amber-700' : 'text-muted-foreground',
                )}
              >
                {part.kind === 'bulk'
                  ? `${total} in stock`
                  : `${available} of ${total} available`}
                {low && <div className="text-xs">Running low</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
