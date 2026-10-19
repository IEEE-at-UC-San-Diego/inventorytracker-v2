import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { DrawerGrid } from '#/components/drawer-grid'
import { ZoneElevation, ZoneStrip } from '#/components/zone-view'
import { useStableQuery } from '#/lib/queries'

/** Pick a drawer by walking zone → unit → drawer on the actual layout. */
export function DrawerPicker({
  value,
  onChange,
  initialZoneId,
}: {
  value: Id<'drawers'> | undefined
  onChange: (drawerId: Id<'drawers'>, label: string) => void
  initialZoneId?: Id<'zones'>
}) {
  const zones = useQuery(api.zones.list)
  const [zoneId, setZoneId] = useState(initialZoneId)
  const activeZoneId = zoneId ?? zones?.[0]?._id
  const layout = useStableQuery(
    api.zones.layout,
    activeZoneId ? { zoneId: activeZoneId } : 'skip',
  )
  const [unitId, setUnitId] = useState<Id<'units'>>()
  const unit = layout?.units.find((u) => u._id === unitId)
  const selected = value ? new Set([value]) : undefined

  if (zones?.length === 0) {
    return <p className="text-sm text-muted-foreground">No zones set up yet.</p>
  }

  return (
    <div className="space-y-3">
      {zones && (
        <ZoneStrip
          zones={zones}
          selectedId={activeZoneId}
          onSelect={(id) => {
            setZoneId(id)
            setUnitId(undefined)
          }}
        />
      )}
      {layout && (
        <ZoneElevation
          layout={layout}
          highlight={selected}
          selectedUnitId={unitId}
          onUnitClick={(u) => setUnitId(u._id)}
        />
      )}
      {unit ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {unit.name}: pick a drawer
          </p>
          <div className="mx-auto aspect-[4/3] max-h-56 w-full">
            <DrawerGrid
              rows={unit.rows}
              cols={unit.cols}
              drawers={unit.drawers}
              selected={selected}
              onDrawerClick={(drawer) =>
                onChange(
                  drawer._id,
                  `${layout?.zone.name} › ${unit.name} › ${drawer.label}`,
                )
              }
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Click a storage unit.</p>
      )}
    </div>
  )
}
