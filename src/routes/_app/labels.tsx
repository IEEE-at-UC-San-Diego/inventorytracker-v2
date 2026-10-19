import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import QRCode from 'qrcode'
import { Printer } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { PageLoading } from '#/components/app-shell'
import { Button } from '#/components/ui/button'
import { loadQuery } from '#/lib/queries'

export const Route = createFileRoute('/_app/labels')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { zone?: Id<'zones'>; unit?: Id<'units'> } => ({
    zone: typeof search.zone === 'string' ? (search.zone as Id<'zones'>) : undefined,
    unit: typeof search.unit === 'string' ? (search.unit as Id<'units'>) : undefined,
  }),
  loader: ({ location }) => {
    const { zone } = location.search as { zone?: Id<'zones'> }
    return zone && loadQuery(api.zones.layout, { zoneId: zone })
  },
  component: LabelsPage,
})

function LabelsPage() {
  const { zone: zoneId, unit: unitId } = Route.useSearch()
  const layout = useQuery(api.zones.layout, zoneId ? { zoneId } : 'skip')

  if (!zoneId) return <p className="text-sm text-muted-foreground">Pick a zone from Manage.</p>
  if (!layout) return <PageLoading />

  const units = layout.units.filter((u) => !unitId || u._id === unitId)

  return (
    <div className="space-y-6">
      <header className="no-print flex items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">QR labels</h1>
          <p className="text-sm text-muted-foreground">
            Scanning a label opens that drawer. Merged drawers keep their label.
          </p>
        </div>
        <Button onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </header>
      {units.map((unit) => (
        <section key={unit._id} className="break-inside-avoid space-y-2">
          <h2 className="text-sm font-semibold">
            {layout.zone.name} › {unit.name}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
            {[...unit.drawers]
              .sort((a, b) => a.row - b.row || a.col - b.col)
              .map((drawer) => (
                <DrawerLabel key={drawer._id} drawer={drawer} unitName={unit.name} />
              ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function DrawerLabel({ drawer, unitName }: { drawer: Doc<'drawers'>; unitName: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    const url = `${window.location.origin}/d/${drawer._id}`
    void QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(
      setSvg,
    )
  }, [drawer._id])

  return (
    <div className="flex break-inside-avoid items-center gap-2 rounded-md border bg-white p-2">
      <div className="size-14 shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="min-w-0 leading-tight">
        <div className="font-mono text-lg font-semibold">{drawer.label}</div>
        <div className="truncate text-[10px] text-muted-foreground">{unitName}</div>
        {drawer.name && <div className="truncate text-[10px]">{drawer.name}</div>}
      </div>
    </div>
  )
}
