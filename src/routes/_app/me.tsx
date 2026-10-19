import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { LocationText, locationLabel } from '#/components/location'
import { CheckinButton } from '#/components/part-actions'
import { loadQuery } from '#/lib/queries'

export const Route = createFileRoute('/_app/me')({
  loader: () =>
    Promise.all([
      loadQuery(api.inventory.mine, {}),
      loadQuery(api.users.me, {}),
      loadQuery(api.inventory.checkedOut, {}),
    ]),
  component: MyItemsPage,
})

function MyItemsPage() {
  const mine = useQuery(api.inventory.mine)
  const me = useQuery(api.users.me)
  const everyone = useQuery(api.inventory.checkedOut)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="space-y-2">
        <h1 className="text-lg font-semibold">Checked out to you</h1>
        {mine === undefined ? null : mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don’t have anything checked out.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {mine.map((item) => (
              <li key={item._id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <Link
                    to="/parts/$partId"
                    params={{ partId: item.partId }}
                    className="font-medium hover:underline"
                  >
                    {item.part?.name}
                  </Link>{' '}
                  <span className="text-muted-foreground">{item.label}</span>
                  <div className="text-xs">
                    Goes back to <LocationText location={item.location} />
                  </div>
                </div>
                <CheckinButton
                  itemId={item._id}
                  homeLabel={item.location ? locationLabel(item.location) : 'its drawer'}
                  zoneId={item.location?.zoneId}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {me?.isOfficer && everyone && everyone.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Everything checked out</h2>
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {everyone.map((item) => (
              <li key={item._id} className="flex items-center gap-3 px-4 py-2.5">
                <Link
                  to="/parts/$partId"
                  params={{ partId: item.partId }}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  {item.part?.name}{' '}
                  <span className="text-muted-foreground">{item.label}</span>
                </Link>
                <span>{item.holderName}</span>
                <span className="w-24 text-right text-muted-foreground tabular-nums">
                  {item.checkedOutAt && new Date(item.checkedOutAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
