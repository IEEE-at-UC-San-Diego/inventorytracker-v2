import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { LocationText, locationLabel } from '#/components/location'
import {
  AddItemButton,
  CheckinButton,
  CheckoutButton,
  MoveItemButton,
  MoveStockButton,
  RemoveItemButton,
  RestockButton,
  SetStockButton,
  TakeButton,
} from '#/components/part-actions'
import { PartFormButton } from '#/components/part-form'
import { Button } from '#/components/ui/button'
import { PageLoading } from '#/components/app-shell'
import { WhereMap } from '#/components/where-map'
import { attempt } from '#/lib/errors'
import { loadQuery } from '#/lib/queries'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/_app/parts/$partId')({
  loader: async ({ params: { partId } }) => {
    const [data] = await Promise.all([
      loadQuery(api.parts.get, { partId }),
      loadQuery(api.users.me, {}),
    ])
    // Warm the maps too, so they don't fill in after the page appears.
    const zoneIds = new Set(data?.locations.map(({ location }) => location.zoneId))
    await Promise.all([...zoneIds].map((zoneId) => loadQuery(api.zones.layout, { zoneId })))
  },
  component: PartPage,
})

type PartDetail = NonNullable<FunctionReturnType<typeof api.parts.get>>

function PartPage() {
  const { partId } = Route.useParams()
  const data = useQuery(api.parts.get, { partId })
  const me = useQuery(api.users.me)
  const officer = !!me?.isOfficer

  if (data === undefined) return <PageLoading />
  if (data === null) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        This part doesn’t exist. <Link to="/" className="text-primary underline">Search</Link>
      </p>
    )
  }

  const { part, total, available, low } = data
  // Group highlighted drawers by zone for the maps.
  const zones = new Map<Id<'zones'>, Array<Id<'drawers'>>>()
  for (const { location } of data.locations) {
    zones.set(location.zoneId, [...(zones.get(location.zoneId) ?? []), location.drawerId])
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{part.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[part.category, part.kind === 'bulk' ? 'Counted' : 'Tracked individually']
              .filter(Boolean)
              .join(' · ')}
          </p>
          {part.notes && (
            <p className="mt-3 max-w-2xl text-sm whitespace-pre-wrap">{part.notes}</p>
          )}
        </div>
        <div className="text-right">
          <div className={cn('text-2xl font-semibold tabular-nums', low && 'text-amber-700')}>
            {part.kind === 'bulk' ? total : `${available}/${total}`}
          </div>
          <div className="text-xs text-muted-foreground">
            {part.kind === 'bulk' ? 'in stock' : 'available'}
            {low && ' · running low'}
          </div>
        </div>
        {officer && (
          <div className="flex w-full gap-2 sm:w-auto">
            <PartFormButton part={part} />
            <DeletePartButton partId={part._id} />
          </div>
        )}
      </header>

      {zones.size > 0 && (
        <section className="grid gap-4 lg:grid-cols-2">
          {[...zones].map(([zoneId, drawerIds]) => (
            <WhereMap key={zoneId} zoneId={zoneId} drawerIds={drawerIds} />
          ))}
        </section>
      )}

      {part.kind === 'bulk' ? (
        <BulkStock data={data} officer={officer} />
      ) : (
        <TrackedItems data={data} officer={officer} />
      )}

      <History events={data.events} />
    </div>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function BulkStock({ data, officer }: { data: PartDetail; officer: boolean }) {
  const { part } = data
  return (
    <Section
      title="Where it’s stored"
      action={
        officer && (
          <RestockButton partId={part._id} partName={part.name} label="Add to a drawer" />
        )
      }
    >
      {data.stock.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not stored anywhere yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {data.stock.map((row) => (
            <li key={row._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <LocationText location={row.location} className="min-w-0 flex-1 text-sm" />
              <span className="w-16 text-right text-sm tabular-nums">{row.quantity}</span>
              <div className="flex gap-1">
                <TakeButton
                  partId={part._id}
                  partName={part.name}
                  drawerId={row.drawerId}
                  available={row.quantity}
                />
                <MoveStockButton
                  partId={part._id}
                  partName={part.name}
                  fromDrawerId={row.drawerId}
                  available={row.quantity}
                  zoneId={row.location?.zoneId}
                />
                {officer && (
                  <>
                    <RestockButton
                      partId={part._id}
                      partName={part.name}
                      drawerId={row.drawerId}
                    />
                    <SetStockButton stockId={row._id} quantity={row.quantity} />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function TrackedItems({ data, officer }: { data: PartDetail; officer: boolean }) {
  const { part } = data
  return (
    <Section
      title="Units"
      action={officer && <AddItemButton partId={part._id} partName={part.name} />}
    >
      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No units added yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {data.items.map((item) => (
            <li key={item._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{item.label}</span>
                <div>
                  {item.holderId ? (
                    <span className="text-amber-700">
                      {item.heldByMe ? 'With you' : `With ${item.holderName}`}
                      {item.checkedOutAt &&
                        ` since ${new Date(item.checkedOutAt).toLocaleDateString()}`}
                    </span>
                  ) : (
                    <LocationText location={item.location} />
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                {!item.holderId ? (
                  <CheckoutButton itemId={item._id} />
                ) : (
                  (item.heldByMe || officer) && (
                    <CheckinButton
                      itemId={item._id}
                      homeLabel={item.location ? locationLabel(item.location) : 'its drawer'}
                      zoneId={item.location?.zoneId}
                    />
                  )
                )}
                {!item.holderId && (
                  <MoveItemButton itemId={item._id} zoneId={item.location?.zoneId} />
                )}
                {officer && !item.holderId && <RemoveItemButton itemId={item._id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

type PartEvent = PartDetail['events'][number]

function describe(event: PartEvent) {
  const what = event.itemLabel ?? event.quantity
  const from = event.from ? locationLabel(event.from) : 'a drawer'
  const to = event.to ? locationLabel(event.to) : 'a drawer'
  switch (event.action) {
    case 'take':
      return `took ${what} from ${from}`
    case 'restock':
      return `added ${what} to ${to}`
    case 'adjust':
      return event.to
        ? `recounted ${to} as ${event.quantity}`
        : `stopped storing it in ${from}`
    case 'move':
      return `moved ${what} from ${from} to ${to}`
    case 'checkout':
      return `checked out ${what}`
    case 'checkin':
      return `returned ${what} to ${to}`
  }
}

function History({ events }: { events: Array<PartEvent> }) {
  if (events.length === 0) return null
  return (
    <Section title="History">
      <ul className="space-y-1.5 text-sm">
        {events.map((event) => (
          <li key={event._id} className="flex gap-3">
            <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
              {new Date(event._creationTime).toLocaleDateString()}
            </span>
            <span className="min-w-0">
              <span className="font-medium">{event.userName}</span> {describe(event)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function DeletePartButton({ partId }: { partId: Id<'parts'> }) {
  const remove = useMutation(api.parts.remove)
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    )
  }
  return (
    <Button
      size="sm"
      variant="destructive"
      onClick={async () => {
        if (await attempt(() => remove({ partId }), 'Part deleted')) {
          void navigate({ to: '/' })
        }
      }}
      onBlur={() => setConfirming(false)}
    >
      Really delete?
    </Button>
  )
}
