import { useRef, useState } from 'react'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { DrawerGrid } from '#/components/drawer-grid'
import { cn } from '#/lib/utils'

export type ZoneLayout = NonNullable<FunctionReturnType<typeof api.zones.layout>>
export type LayoutUnit = ZoneLayout['units'][number]
export type Rect = { x: number; y: number; w: number; h: number }

/** The small overview of every wall/table, used to switch zones. */
export function ZoneStrip({
  zones,
  selectedId,
  onSelect,
  highlight,
}: {
  zones: Array<Doc<'zones'>>
  selectedId?: Id<'zones'>
  onSelect: (zoneId: Id<'zones'>) => void
  highlight?: ReadonlySet<Id<'zones'>>
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {zones.map((zone) => (
        <button
          key={zone._id}
          type="button"
          onClick={() => onSelect(zone._id)}
          className={cn(
            'flex h-12 min-w-24 shrink-0 items-end rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors',
            zone._id === selectedId
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-card hover:border-primary/50',
            highlight?.has(zone._id) &&
              zone._id !== selectedId &&
              'border-amber-500 bg-highlight/40',
          )}
          style={{ flexGrow: zone.width }}
        >
          <span className="truncate font-medium">{zone.name}</span>
        </button>
      ))}
    </div>
  )
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

type Drag = {
  unitId: Id<'units'>
  mode: 'move' | 'resize'
  startX: number
  startY: number
  origin: Rect
  rect: Rect
}

/**
 * Front-on view of a zone: units sit on a grid, so stacked organizers appear
 * stacked. Pass onChangeUnit to let officers drag and resize units.
 */
export function ZoneElevation({
  layout,
  highlight,
  selectedUnitId,
  onUnitClick,
  onChangeUnit,
}: {
  layout: ZoneLayout
  highlight?: ReadonlySet<Id<'drawers'>>
  selectedUnitId?: Id<'units'>
  onUnitClick?: (unit: LayoutUnit) => void
  onChangeUnit?: (unit: LayoutUnit, rect: Rect) => void
}) {
  const { zone, units } = layout
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  function rectFor(unit: LayoutUnit): Rect {
    return drag?.unitId === unit._id ? drag.rect : unit
  }

  function startDrag(
    event: React.PointerEvent,
    unit: LayoutUnit,
    mode: Drag['mode'],
  ) {
    if (!onChangeUnit) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const origin = { x: unit.x, y: unit.y, w: unit.w, h: unit.h }
    setDrag({
      unitId: unit._id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      rect: origin,
    })
  }

  function moveDrag(event: React.PointerEvent) {
    if (!drag || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    const dx = Math.round(((event.clientX - drag.startX) / box.width) * zone.width)
    const dy = Math.round(((event.clientY - drag.startY) / box.height) * zone.height)
    const { origin } = drag
    const rect =
      drag.mode === 'move'
        ? {
            ...origin,
            x: Math.min(Math.max(origin.x + dx, 0), zone.width - origin.w),
            y: Math.min(Math.max(origin.y + dy, 0), zone.height - origin.h),
          }
        : {
            ...origin,
            w: Math.min(Math.max(origin.w + dx, 1), zone.width - origin.x),
            h: Math.min(Math.max(origin.h + dy, 1), zone.height - origin.y),
          }
    setDrag({ ...drag, rect })
  }

  function endDrag(unit: LayoutUnit) {
    if (!drag) return
    const { rect, origin } = drag
    setDrag(null)
    const moved =
      rect.x !== origin.x || rect.y !== origin.y || rect.w !== origin.w || rect.h !== origin.h
    if (moved) onChangeUnit?.(unit, rect)
    else onUnitClick?.(unit)
  }

  const dragBlocked =
    drag !== null &&
    units.some((u) => u._id !== drag.unitId && overlaps(drag.rect, u))

  return (
    <div
      ref={ref}
      className="relative mx-auto rounded-lg border bg-card"
      style={{
        aspectRatio: `${zone.width} / ${zone.height}`,
        width: `min(100%, calc(65vh * ${zone.width / zone.height}))`,
        backgroundImage:
          'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
        backgroundSize: `${100 / zone.width}% ${100 / zone.height}%`,
      }}
    >
      {units.length === 0 && (
        <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          No storage units here yet.
        </p>
      )}
      {units.map((unit) => {
        const rect = rectFor(unit)
        const isDragging = drag?.unitId === unit._id
        const hasHighlight = unit.drawers.some((d) => highlight?.has(d._id))
        return (
          <div
            key={unit._id}
            role="button"
            tabIndex={0}
            onClick={onChangeUnit ? undefined : () => onUnitClick?.(unit)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onUnitClick?.(unit)
            }}
            onPointerDown={(e) => startDrag(e, unit, 'move')}
            onPointerMove={moveDrag}
            onPointerUp={() => endDrag(unit)}
            className={cn(
              'absolute flex touch-none select-none flex-col gap-0.5 rounded-md border bg-background p-1 shadow-sm transition-shadow',
              onChangeUnit ? 'cursor-grab' : 'cursor-pointer hover:border-primary/60',
              unit._id === selectedUnitId && 'border-primary ring-2 ring-primary/30',
              hasHighlight && 'border-amber-500 ring-2 ring-amber-400/50',
              isDragging && 'z-10 cursor-grabbing shadow-lg',
              isDragging && dragBlocked && 'border-destructive ring-destructive/30',
            )}
            style={{
              left: `${(rect.x / zone.width) * 100}%`,
              top: `${(rect.y / zone.height) * 100}%`,
              width: `${(rect.w / zone.width) * 100}%`,
              height: `${(rect.h / zone.height) * 100}%`,
            }}
          >
            <span className="truncate px-0.5 text-[10px] font-medium leading-tight text-muted-foreground">
              {unit.name}
            </span>
            <div className="min-h-0 flex-1">
              <DrawerGrid
                size="mini"
                rows={unit.rows}
                cols={unit.cols}
                drawers={unit.drawers}
                highlight={highlight}
              />
            </div>
            {onChangeUnit && (
              <span
                onPointerDown={(e) => startDrag(e, unit, 'resize')}
                onPointerMove={(e) => {
                  e.stopPropagation()
                  moveDrag(e)
                }}
                onPointerUp={(e) => {
                  e.stopPropagation()
                  endDrag(unit)
                }}
                className="absolute -right-1 -bottom-1 size-3 cursor-nwse-resize rounded-sm border border-primary bg-background"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
