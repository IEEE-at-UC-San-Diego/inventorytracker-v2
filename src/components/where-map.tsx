import { useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ZoneElevation } from '#/components/zone-view'

/** One zone's elevation with the given drawers highlighted. */
export function WhereMap({
  zoneId,
  drawerIds,
}: {
  zoneId: Id<'zones'>
  drawerIds: Array<Id<'drawers'>>
}) {
  const layout = useQuery(api.zones.layout, { zoneId })
  const navigate = useNavigate()
  if (!layout) return <div className="aspect-[2/1] rounded-lg border bg-muted/40" />
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{layout.zone.name}</p>
      <ZoneElevation
        layout={layout}
        highlight={new Set(drawerIds)}
        onUnitClick={(unit) =>
          void navigate({ to: '/space', search: { zone: zoneId, unit: unit._id } })
        }
      />
    </div>
  )
}
