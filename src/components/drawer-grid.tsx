import type { Doc, Id } from '../../convex/_generated/dataModel'
import { cn } from '#/lib/utils'

type Drawer = Doc<'drawers'> & { count?: number }

type Props = {
  rows: number
  cols: number
  drawers: Array<Drawer>
  highlight?: ReadonlySet<Id<'drawers'>>
  selected?: ReadonlySet<Id<'drawers'>>
  onDrawerClick?: (drawer: Drawer) => void
  /** "mini" draws cells only; "full" adds labels and names. */
  size?: 'mini' | 'full'
  className?: string
}

/** A storage unit's face, showing each drawer in its grid position. */
export function DrawerGrid({
  rows,
  cols,
  drawers,
  highlight,
  selected,
  onDrawerClick,
  size = 'full',
  className,
}: Props) {
  const full = size === 'full'
  return (
    <div
      className={cn('grid h-full w-full', full ? 'gap-1' : 'gap-px', className)}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {drawers.map((drawer) => {
        const isHighlighted = highlight?.has(drawer._id)
        const isSelected = selected?.has(drawer._id)
        const Tag = onDrawerClick ? 'button' : 'div'
        return (
          <Tag
            key={drawer._id}
            type={onDrawerClick ? 'button' : undefined}
            onClick={onDrawerClick ? () => onDrawerClick(drawer) : undefined}
            title={drawer.name ? `${drawer.label} · ${drawer.name}` : drawer.label}
            className={cn(
              'relative min-w-0 overflow-hidden border text-left transition-colors',
              full ? 'rounded-md p-1.5' : 'rounded-[2px]',
              isHighlighted
                ? 'border-amber-500 bg-highlight text-foreground'
                : isSelected
                  ? 'border-primary bg-primary/15'
                  : drawer.count
                    ? full
                      ? 'border-border bg-card'
                      : 'border-primary/25 bg-primary/15'
                    : 'border-dashed border-border bg-muted/40',
              onDrawerClick && !isHighlighted && 'hover:border-primary/60',
            )}
            style={{
              gridRow: `${drawer.row + 1} / span ${drawer.rowSpan}`,
              gridColumn: `${drawer.col + 1} / span ${drawer.colSpan}`,
            }}
          >
            {full && (
              <>
                <span className="block font-mono text-[11px] text-muted-foreground">
                  {drawer.label}
                </span>
                {drawer.name && (
                  <span className="block truncate text-xs font-medium">
                    {drawer.name}
                  </span>
                )}
              </>
            )}
          </Tag>
        )
      })}
    </div>
  )
}
