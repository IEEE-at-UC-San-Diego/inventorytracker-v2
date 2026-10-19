import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { DrawerGrid } from '#/components/drawer-grid'
import { ZoneElevation, ZoneStrip } from '#/components/zone-view'
import type { LayoutUnit, Rect, ZoneLayout } from '#/components/zone-view'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { attempt } from '#/lib/errors'
import { loadQuery, useStableQuery } from '#/lib/queries'

export const Route = createFileRoute('/_app/manage')({
  validateSearch: (search: Record<string, unknown>): { zone?: Id<'zones'> } => ({
    zone: typeof search.zone === 'string' ? (search.zone as Id<'zones'>) : undefined,
  }),
  loader: async ({ location }) => {
    const { zone } = location.search as { zone?: Id<'zones'> }
    const [zones] = await Promise.all([
      loadQuery(api.zones.list, {}),
      loadQuery(api.users.me, {}),
    ])
    const zoneId = zone ?? zones?.[0]?._id
    if (zoneId) await loadQuery(api.zones.layout, { zoneId })
  },
  component: ManagePage,
})

function ManagePage() {
  const me = useQuery(api.users.me)
  const zones = useQuery(api.zones.list)
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const zoneId = search.zone ?? zones?.[0]?._id
  const layout = useStableQuery(api.zones.layout, zoneId ? { zoneId } : 'skip')
  const [unitId, setUnitId] = useState<Id<'units'>>()
  // Apply the new position immediately so a dropped unit doesn't snap back
  // while the mutation round-trips.
  const updateUnit = useMutation(api.units.update).withOptimisticUpdate(
    (store, { unitId, name, ...rect }) => {
      const unit = layout?.units.find((u) => u._id === unitId)
      if (!unit) return
      const current = store.getQuery(api.zones.layout, { zoneId: unit.zoneId })
      if (!current) return
      store.setQuery(
        api.zones.layout,
        { zoneId: unit.zoneId },
        {
          ...current,
          units: current.units.map((u) => (u._id === unitId ? { ...u, name, ...rect } : u)),
        },
      )
    },
  )

  if (me && !me.isOfficer) {
    return <p className="text-sm text-muted-foreground">Only officers can edit the layout.</p>
  }

  const unit = layout?.units.find((u) => u._id === unitId)
  const selectZone = (zone: Id<'zones'>) => {
    setUnitId(undefined)
    void navigate({ search: { zone } })
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">Layout</h1>
        <ZoneFormButton onSaved={selectZone} />
      </header>

      {zones?.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Start by adding a zone for each wall or table, e.g. “Back table” or
          “North wall shelves”. Each zone is drawn front-on, so stacked
          organizers sit on top of each other.
        </p>
      )}

      {zones && zones.length > 0 && (
        <ZoneStrip zones={zones} selectedId={zoneId} onSelect={selectZone} />
      )}

      {layout && (
        <>
          <ZoneToolbar layout={layout} onRemoved={() => void navigate({ search: {} })} />
          <ZoneElevation
            layout={layout}
            selectedUnitId={unitId}
            onUnitClick={(u) => setUnitId(u._id)}
            onChangeUnit={(u, rect) =>
              void attempt(() => updateUnit({ unitId: u._id, name: u.name, ...rect }))
            }
          />
          <p className="text-center text-xs text-muted-foreground">
            Drag units to move them; drag the corner to resize. Click a unit to edit it.
          </p>
          {unit && <UnitEditor key={unit._id} unit={unit} onRemoved={() => setUnitId(undefined)} />}
        </>
      )}
    </div>
  )
}

function ZoneToolbar({ layout, onRemoved }: { layout: ZoneLayout; onRemoved: () => void }) {
  const { zone } = layout
  const reorder = useMutation(api.zones.reorder)
  const remove = useMutation(api.zones.remove)
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-auto text-sm font-medium">
        {zone.name}{' '}
        <span className="font-normal text-muted-foreground">
          {zone.width} × {zone.height} grid
        </span>
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Move left"
        onClick={() => void attempt(() => reorder({ zoneId: zone._id, direction: -1 }))}
      >
        <ChevronLeft />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Move right"
        onClick={() => void attempt(() => reorder({ zoneId: zone._id, direction: 1 }))}
      >
        <ChevronRight />
      </Button>
      <ZoneFormButton zone={zone} />
      <AddUnitButton layout={layout} />
      <Button size="sm" variant="outline" asChild>
        <Link to="/labels" search={{ zone: zone._id }}>
          <Printer /> Labels
        </Link>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={async () => {
          if (await attempt(() => remove({ zoneId: zone._id }), 'Zone removed')) onRemoved()
        }}
      >
        Delete zone
      </Button>
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
  max = 64,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  max?: number
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </div>
  )
}

function ZoneFormButton({
  zone,
  onSaved,
}: {
  zone?: Doc<'zones'>
  onSaved?: (zoneId: Id<'zones'>) => void
}) {
  const create = useMutation(api.zones.create)
  const update = useMutation(api.zones.update)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [width, setWidth] = useState(24)
  const [height, setHeight] = useState(12)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    let id = zone?._id
    const ok = await attempt(async () => {
      if (zone) await update({ zoneId: zone._id, name, width, height })
      else id = await create({ name, width, height })
    })
    if (!ok) return
    setOpen(false)
    if (id) onSaved?.(id)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(zone?.name ?? '')
          setWidth(zone?.width ?? 24)
          setHeight(zone?.height ?? 12)
        }
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={zone ? 'outline' : 'default'}>
          {zone ? 'Edit zone' : 'New zone'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{zone ? 'Edit zone' : 'New zone'}</DialogTitle>
            <DialogDescription>
              A wall or table, seen from the front. The grid is how many cells
              wide and tall it is; a cell is roughly the size of a small organizer drawer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="zone-name">Name</Label>
            <Input
              id="zone-name"
              autoFocus
              placeholder="e.g. Back table"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="zone-w" label="Width" value={width} onChange={setWidth} />
            <NumberField id="zone-h" label="Height" value={height} onChange={setHeight} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** First free spot, scanning from the bottom so new units "sit" on the surface. */
function findSpot(layout: ZoneLayout, w: number, h: number): Rect | null {
  const { zone, units } = layout
  for (let y = zone.height - h; y >= 0; y--) {
    for (let x = 0; x + w <= zone.width; x++) {
      const rect = { x, y, w, h }
      if (!units.some((u) => overlaps(rect, u))) return rect
    }
  }
  return null
}

function AddUnitButton({ layout }: { layout: ZoneLayout }) {
  const create = useMutation(api.units.create)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [rows, setRows] = useState(4)
  const [cols, setCols] = useState(3)
  const [w, setW] = useState(3)
  const [h, setH] = useState(4)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const spot = findSpot(layout, w, h)
    if (!spot) return
    const ok = await attempt(
      () => create({ zoneId: layout.zone._id, name, rows, cols, ...spot }),
      'Unit added',
    )
    if (ok) setOpen(false)
  }

  const fits = Number.isInteger(w) && Number.isInteger(h) && findSpot(layout, w, h) !== null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(`Organizer ${layout.units.length + 1}`)
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Add unit</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add storage unit</DialogTitle>
            <DialogDescription>
              A cabinet, drawer organizer, shelf or bin. You can drag it into place afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="unit-name">Name</Label>
            <Input id="unit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="unit-rows" label="Drawer rows" value={rows} onChange={setRows} max={40} />
            <NumberField id="unit-cols" label="Drawer columns" value={cols} onChange={setCols} max={40} />
            <NumberField id="unit-w" label="Width on grid" value={w} onChange={setW} />
            <NumberField id="unit-h" label="Height on grid" value={h} onChange={setH} />
          </div>
          {!fits && (
            <p className="text-sm text-destructive">There’s no free space that size in this zone.</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!fits}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UnitEditor({ unit, onRemoved }: { unit: LayoutUnit; onRemoved: () => void }) {
  const update = useMutation(api.units.update)
  const setGrid = useMutation(api.units.setGrid)
  const remove = useMutation(api.units.remove)
  const merge = useMutation(api.units.mergeDrawers)
  const split = useMutation(api.units.splitDrawer)
  const rename = useMutation(api.units.renameDrawer)
  const [name, setName] = useState(unit.name)
  const [rows, setRows] = useState(unit.rows)
  const [cols, setCols] = useState(unit.cols)
  const [selected, setSelected] = useState<ReadonlySet<Id<'drawers'>>>(new Set())
  const [drawerName, setDrawerName] = useState('')

  const picked = unit.drawers.filter((d) => selected.has(d._id))
  const single = picked.length === 1 ? picked[0] : undefined

  function toggle(drawerId: Id<'drawers'>) {
    const next = new Set(selected)
    if (next.has(drawerId)) next.delete(drawerId)
    else next.add(drawerId)
    setSelected(next)
    const only = unit.drawers.filter((d) => next.has(d._id))
    setDrawerName(only.length === 1 ? (only[0].name ?? '') : '')
  }

  const rect = { x: unit.x, y: unit.y, w: unit.w, h: unit.h }

  return (
    <section className="grid gap-6 rounded-lg border bg-card p-4 md:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            void attempt(() => update({ unitId: unit._id, name, ...rect }), 'Saved')
          }}
        >
          <Label htmlFor="edit-unit-name">Unit name</Label>
          <div className="flex gap-2">
            <Input id="edit-unit-name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="outline" disabled={name === unit.name}>
              Save
            </Button>
          </div>
        </form>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void attempt(() => setGrid({ unitId: unit._id, rows, cols }), 'Grid updated')
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <NumberField id="edit-rows" label="Rows" value={rows} onChange={setRows} max={40} />
            <NumberField id="edit-cols" label="Columns" value={cols} onChange={setCols} max={40} />
          </div>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={rows === unit.rows && cols === unit.cols}
          >
            Change grid
          </Button>
          <p className="text-xs text-muted-foreground">Only works while every drawer is empty.</p>
        </form>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/labels" search={{ zone: unit.zoneId, unit: unit._id }}>
              <Printer /> Labels
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              if (await attempt(() => remove({ unitId: unit._id }), 'Unit removed')) onRemoved()
            }}
          >
            Delete unit
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Select drawers to merge wide drawers, split them back, or give one a name.
        </p>
        <div className="aspect-[4/3] max-h-80 w-full">
          <DrawerGrid
            rows={unit.rows}
            cols={unit.cols}
            drawers={unit.drawers}
            selected={selected}
            onDrawerClick={(d) => toggle(d._id)}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={picked.length < 2}
            onClick={async () => {
              if (await attempt(() => merge({ drawerIds: [...selected] }), 'Merged')) {
                setSelected(new Set())
              }
            }}
          >
            Merge
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!single || (single.rowSpan === 1 && single.colSpan === 1)}
            onClick={async () => {
              if (single && (await attempt(() => split({ drawerId: single._id }), 'Split'))) {
                setSelected(new Set())
              }
            }}
          >
            Split
          </Button>
          {single && (
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void attempt(() => rename({ drawerId: single._id, name: drawerName }), 'Saved')
              }}
            >
              <Input
                placeholder={`Name for ${single.label}, e.g. “Resistors 1k–10k”`}
                value={drawerName}
                onChange={(e) => setDrawerName(e.target.value)}
                className="h-8"
              />
              <Button size="sm" type="submit" variant="outline">
                Name
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
