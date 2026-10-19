import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { locationLabel } from '#/components/location'
import {
  CheckinButton,
  CheckoutButton,
  MoveItemButton,
  MoveStockButton,
  QuantityInput,
  RestockButton,
  SetStockButton,
  TakeButton,
} from '#/components/part-actions'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { attempt } from '#/lib/errors'
import { cn } from '#/lib/utils'

export type DrawerData = NonNullable<FunctionReturnType<typeof api.drawers.get>>

/** What's in a drawer, with the actions members and officers can take. */
export function DrawerContents({
  data,
  officer,
}: {
  data: DrawerData
  officer: boolean
}) {
  const { stock, items, location } = data
  const zoneId = location.zoneId
  const empty = stock.length === 0 && items.length === 0
  return (
    <div className="space-y-3">
      {empty ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          This drawer is empty.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {stock.map((row) => (
            <li key={row._id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <PartLink part={row.part} />
              <span
                className={cn(
                  'text-sm tabular-nums',
                  row.quantity === 0 ? 'text-amber-700' : 'text-muted-foreground',
                )}
              >
                {row.quantity === 0 ? 'Out' : `× ${row.quantity}`}
              </span>
              <div className="flex gap-1">
                <TakeButton
                  partId={row.part._id}
                  partName={row.part.name}
                  drawerId={data.drawer._id}
                  available={row.quantity}
                />
                <MoveStockButton
                  partId={row.part._id}
                  partName={row.part.name}
                  fromDrawerId={data.drawer._id}
                  available={row.quantity}
                  zoneId={zoneId}
                />
                {officer && (
                  <>
                    <RestockButton
                      partId={row.part._id}
                      partName={row.part.name}
                      drawerId={data.drawer._id}
                    />
                    <SetStockButton stockId={row._id} quantity={row.quantity} />
                  </>
                )}
              </div>
            </li>
          ))}
          {items.map((item) => (
            <li key={item._id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <PartLink part={item.part} suffix={item.label} />
              <span className="text-sm text-amber-700">
                {item.holderId && (item.heldByMe ? 'With you' : `With ${item.holderName}`)}
              </span>
              <div className="flex gap-1">
                {!item.holderId ? (
                  <>
                    <CheckoutButton itemId={item._id} />
                    <MoveItemButton itemId={item._id} zoneId={zoneId} />
                  </>
                ) : (
                  (item.heldByMe || officer) && (
                    <CheckinButton
                      itemId={item._id}
                      homeLabel={locationLabel(location)}
                      zoneId={zoneId}
                    />
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {officer && <AddToDrawerButton drawerId={data.drawer._id} />}
    </div>
  )
}

function PartLink({ part, suffix }: { part: Doc<'parts'>; suffix?: string }) {
  return (
    <Link
      to="/parts/$partId"
      params={{ partId: part._id }}
      className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
    >
      {part.name}
      {suffix && <span className="font-normal text-muted-foreground"> {suffix}</span>}
    </Link>
  )
}

/** Officer shortcut for stocking a drawer: pick a part, then a count or label. */
function AddToDrawerButton({ drawerId }: { drawerId: Id<'drawers'> }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [part, setPart] = useState<Doc<'parts'>>()
  const [quantity, setQuantity] = useState(1)
  const [label, setLabel] = useState('')
  const results = useQuery(api.parts.search, open ? { query } : 'skip')
  const restock = useMutation(api.inventory.restock)
  const addItem = useMutation(api.inventory.addItem)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!part) return
    const ok = await attempt(
      () =>
        part.kind === 'bulk'
          ? restock({ partId: part._id, drawerId, quantity })
          : addItem({ partId: part._id, drawerId, label }),
      'Added',
    )
    if (ok) setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setQuery('')
          setPart(undefined)
          setQuantity(1)
          setLabel('')
        }
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Put a part here
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Put a part in this drawer</DialogTitle>
          </DialogHeader>
          {part ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{part.name}</span>
                <Button type="button" variant="link" className="h-auto p-0" onClick={() => setPart(undefined)}>
                  Change
                </Button>
              </div>
              {part.kind === 'bulk' ? (
                <div className="space-y-1.5">
                  <Label>How many</Label>
                  <QuantityInput value={quantity} onChange={setQuantity} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="add-label">Unit label</Label>
                  <Input
                    id="add-label"
                    placeholder="e.g. #3 (optional)"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                autoFocus
                type="search"
                placeholder="Search parts"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
                {results?.map(({ part: result }) => (
                  <li key={result._id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => setPart(result)}
                    >
                      {result.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {result.kind === 'bulk' ? 'Counted' : 'Tracked'}
                      </span>
                    </button>
                  </li>
                ))}
                {results?.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">
                    No matches. Create the part from Find first.
                  </li>
                )}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                !part ||
                (part.kind === 'bulk' && !(Number.isInteger(quantity) && quantity > 0))
              }
            >
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
