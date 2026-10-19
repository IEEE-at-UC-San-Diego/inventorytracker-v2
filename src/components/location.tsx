import { Link } from '@tanstack/react-router'
import type { Location } from '../../convex/lib/locations'
import { cn } from '#/lib/utils'

export function locationLabel(location: Location) {
  return `${location.zoneName} › ${location.unitName} › ${location.drawerLabel}`
}

/** "Back table › Organizer 3 › C4", linking to the drawer. */
export function LocationText({
  location,
  link = true,
  className,
}: {
  location: Location | null | undefined
  link?: boolean
  className?: string
}) {
  if (!location) {
    return <span className={cn('text-muted-foreground', className)}>Unknown location</span>
  }
  const content = (
    <>
      <span className="text-muted-foreground">
        {location.zoneName} › {location.unitName} ›{' '}
      </span>
      <span className="font-mono font-medium">{location.drawerLabel}</span>
      {location.drawerName && (
        <span className="text-muted-foreground"> · {location.drawerName}</span>
      )}
    </>
  )
  if (!link) return <span className={className}>{content}</span>
  return (
    <Link
      to="/d/$drawerId"
      params={{ drawerId: location.drawerId }}
      className={cn('hover:underline', className)}
    >
      {content}
    </Link>
  )
}
