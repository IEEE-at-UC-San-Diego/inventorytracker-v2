import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { DrawerContents } from '#/components/drawer-contents'
import { PageLoading } from '#/components/app-shell'
import { DrawerGrid } from '#/components/drawer-grid'
import { loadQuery } from '#/lib/queries'

// QR labels point here, so this page is built for phones first.
export const Route = createFileRoute('/_app/d/$drawerId')({
  loader: ({ params: { drawerId } }) =>
    Promise.all([
      loadQuery(api.drawers.get, { drawerId }),
      loadQuery(api.users.me, {}),
    ]),
  component: DrawerPage,
})

function DrawerPage() {
  const { drawerId } = Route.useParams()
  const data = useQuery(api.drawers.get, { drawerId })
  const me = useQuery(api.users.me)

  if (data === undefined) return <PageLoading />
  if (data === null) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        This drawer no longer exists. It may have been merged or removed.
      </p>
    )
  }

  const { drawer, location, unit } = data
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            {location.zoneName} › {location.unitName}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Drawer <span className="font-mono">{drawer.label}</span>
            {drawer.name && (
              <span className="font-normal text-muted-foreground"> · {drawer.name}</span>
            )}
          </h1>
          <Link
            to="/space"
            search={{ zone: location.zoneId, unit: unit._id, drawer: drawer._id }}
            className="text-sm text-primary hover:underline"
          >
            Show in space
          </Link>
        </div>
        <div className="h-20 w-24 shrink-0">
          <DrawerGrid
            size="mini"
            rows={unit.rows}
            cols={unit.cols}
            drawers={unit.drawers}
            highlight={new Set([drawer._id])}
          />
        </div>
      </header>
      <DrawerContents data={data} officer={!!me?.isOfficer} />
    </div>
  )
}
