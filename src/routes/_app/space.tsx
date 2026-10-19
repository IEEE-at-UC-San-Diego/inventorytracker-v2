import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id, TableNames } from '../../../convex/_generated/dataModel'
import { DrawerContents } from '#/components/drawer-contents'
import { DrawerGrid } from '#/components/drawer-grid'
import { ZoneElevation, ZoneStrip } from '#/components/zone-view'
import { loadQuery, useStableQuery } from '#/lib/queries'

function param<T extends TableNames>(value: unknown) {
  return typeof value === 'string' && value ? (value as Id<T>) : undefined
}

export const Route = createFileRoute('/_app/space')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { zone?: Id<'zones'>; unit?: Id<'units'>; drawer?: Id<'drawers'> } => ({
    zone: param<'zones'>(search.zone),
    unit: param<'units'>(search.unit),
    drawer: param<'drawers'>(search.drawer),
  }),
  loader: async ({ location }) => {
    const search = location.search as { zone?: Id<'zones'>; drawer?: Id<'drawers'> }
    const [zones] = await Promise.all([
      loadQuery(api.zones.list, {}),
      loadQuery(api.users.me, {}),
      search.drawer && loadQuery(api.drawers.get, { drawerId: search.drawer }),
    ])
    const zoneId = search.zone ?? zones?.[0]?._id
    if (zoneId) await loadQuery(api.zones.layout, { zoneId })
  },
  component: SpacePage,
})

function SpacePage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const zones = useQuery(api.zones.list)
  const me = useQuery(api.users.me)
  const zoneId = search.zone ?? zones?.[0]?._id
  const layout = useStableQuery(api.zones.layout, zoneId ? { zoneId } : 'skip')
  const drawer = useStableQuery(
    api.drawers.get,
    search.drawer ? { drawerId: search.drawer } : 'skip',
  )
  const unit = layout?.units.find((u) => u._id === search.unit)
  const selected = search.drawer ? new Set([search.drawer]) : undefined

  if (zones?.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <p>The space hasn’t been mapped yet.</p>
        {me?.isOfficer && (
          <Link to="/manage" className="mt-2 inline-block text-primary underline">
            Set up zones and storage units
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {zones && (
        <ZoneStrip
          zones={zones}
          selectedId={zoneId}
          onSelect={(zone) => void navigate({ search: { zone } })}
        />
      )}
      {layout && (
        <ZoneElevation
          layout={layout}
          highlight={selected}
          selectedUnitId={unit?._id}
          onUnitClick={(u) =>
            void navigate({ search: { zone: zoneId, unit: u._id } })
          }
        />
      )}
      {unit ? (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{unit.name}</h2>
            <div className="aspect-[4/3] w-full">
              <DrawerGrid
                rows={unit.rows}
                cols={unit.cols}
                drawers={unit.drawers}
                selected={selected}
                onDrawerClick={(d) =>
                  void navigate({
                    search: { zone: zoneId, unit: unit._id, drawer: d._id },
                    replace: true,
                  })
                }
              />
            </div>
          </section>
          <section className="space-y-2">
            {drawer && drawer.unit._id === unit._id ? (
              <>
                <h2 className="text-sm font-semibold">
                  <Link
                    to="/d/$drawerId"
                    params={{ drawerId: drawer.drawer._id }}
                    className="hover:underline"
                  >
                    Drawer <span className="font-mono">{drawer.drawer.label}</span>
                    {drawer.drawer.name && ` · ${drawer.drawer.name}`}
                  </Link>
                </h2>
                <DrawerContents data={drawer} officer={!!me?.isOfficer} />
              </>
            ) : (
              <p className="pt-7 text-sm text-muted-foreground">
                Pick a drawer to see what’s inside.
              </p>
            )}
          </section>
        </div>
      ) : (
        layout &&
        layout.units.length > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Click a storage unit to open it.
          </p>
        )
      )}
    </div>
  )
}
