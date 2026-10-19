import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Minus, Plus } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { DrawerPicker } from '#/components/drawer-picker'
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

type ButtonProps = React.ComponentProps<typeof Button>

/** A dialog that closes itself once onSubmit succeeds. */
function ActionDialog({
  trigger,
  triggerProps,
  title,
  description,
  submitLabel,
  canSubmit = true,
  onSubmit,
  onOpen,
  wide,
  children,
}: {
  trigger: React.ReactNode
  triggerProps?: ButtonProps
  title: string
  description?: React.ReactNode
  submitLabel: string
  canSubmit?: boolean
  onSubmit: () => Promise<boolean>
  onOpen?: () => void
  wide?: boolean
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen?.()
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" {...triggerProps}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className={wide ? 'sm:max-w-2xl' : 'sm:max-w-sm'}>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            const ok = await onSubmit()
            setBusy(false)
            if (ok) setOpen(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="submit" disabled={!canSubmit || busy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function QuantityInput({
  value,
  onChange,
  max,
  min = 1,
  id,
}: {
  value: number
  onChange: (value: number) => void
  max?: number
  min?: number
  id?: string
}) {
  const clamp = (n: number) =>
    Math.max(min, max === undefined ? n : Math.min(n, max))
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label="Less"
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        className="w-24 text-center"
        min={min}
        max={max}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label="More"
        onClick={() => onChange(clamp((Number.isNaN(value) ? 0 : value) + 1))}
      >
        <Plus />
      </Button>
      {max !== undefined && (
        <span className="text-sm text-muted-foreground">of {max}</span>
      )}
    </div>
  )
}

function validQuantity(n: number, max?: number, min = 1) {
  return Number.isInteger(n) && n >= min && (max === undefined || n <= max)
}

// --- Bulk parts ---

export function TakeButton({
  partId,
  partName,
  drawerId,
  available,
}: {
  partId: Id<'parts'>
  partName: string
  drawerId: Id<'drawers'>
  available: number
}) {
  const take = useMutation(api.inventory.take)
  const [quantity, setQuantity] = useState(1)
  return (
    <ActionDialog
      trigger="Take"
      triggerProps={{ variant: 'default', disabled: available === 0 }}
      title={`Take ${partName}`}
      description="Consumables are used up, so nothing needs to come back."
      submitLabel={`Take ${Number.isNaN(quantity) ? '' : quantity}`}
      canSubmit={validQuantity(quantity, available)}
      onOpen={() => setQuantity(1)}
      onSubmit={() =>
        attempt(() => take({ partId, drawerId, quantity }), `Took ${quantity}`)
      }
    >
      <QuantityInput value={quantity} onChange={setQuantity} max={available} />
    </ActionDialog>
  )
}

export function MoveStockButton({
  partId,
  partName,
  fromDrawerId,
  available,
  zoneId,
}: {
  partId: Id<'parts'>
  partName: string
  fromDrawerId: Id<'drawers'>
  available: number
  zoneId?: Id<'zones'>
}) {
  const move = useMutation(api.inventory.moveStock)
  const [quantity, setQuantity] = useState(available)
  const [to, setTo] = useState<Id<'drawers'>>()
  return (
    <ActionDialog
      trigger="Move"
      triggerProps={{ disabled: available === 0 }}
      title={`Move ${partName}`}
      submitLabel="Move"
      wide
      canSubmit={!!to && to !== fromDrawerId && validQuantity(quantity, available)}
      onOpen={() => {
        setQuantity(available)
        setTo(undefined)
      }}
      onSubmit={() =>
        attempt(
          () => move({ partId, fromDrawerId, toDrawerId: to!, quantity }),
          'Moved',
        )
      }
    >
      <div className="space-y-1.5">
        <Label>How many</Label>
        <QuantityInput value={quantity} onChange={setQuantity} max={available} />
      </div>
      <DrawerPicker
        value={to}
        onChange={(id) => setTo(id)}
        initialZoneId={zoneId}
      />
    </ActionDialog>
  )
}

export function RestockButton({
  partId,
  partName,
  drawerId,
  zoneId,
  label = 'Restock',
}: {
  partId: Id<'parts'>
  partName: string
  drawerId?: Id<'drawers'>
  zoneId?: Id<'zones'>
  label?: string
}) {
  const restock = useMutation(api.inventory.restock)
  const [quantity, setQuantity] = useState(1)
  const [to, setTo] = useState(drawerId)
  return (
    <ActionDialog
      trigger={label}
      triggerProps={drawerId ? { variant: 'ghost' } : undefined}
      title={`${label}: ${partName}`}
      submitLabel="Add"
      wide={!drawerId}
      canSubmit={!!to && validQuantity(quantity)}
      onOpen={() => {
        setQuantity(1)
        setTo(drawerId)
      }}
      onSubmit={() =>
        attempt(() => restock({ partId, drawerId: to!, quantity }), 'Added')
      }
    >
      <div className="space-y-1.5">
        <Label>How many to add</Label>
        <QuantityInput value={quantity} onChange={setQuantity} />
      </div>
      {!drawerId && (
        <DrawerPicker value={to} onChange={(id) => setTo(id)} initialZoneId={zoneId} />
      )}
    </ActionDialog>
  )
}

export function SetStockButton({
  stockId,
  quantity: current,
}: {
  stockId: Id<'stock'>
  quantity: number
}) {
  const setStock = useMutation(api.inventory.setStock)
  const removeStock = useMutation(api.inventory.removeStock)
  const [quantity, setQuantity] = useState(current)
  return (
    <ActionDialog
      trigger="Recount"
      triggerProps={{ variant: 'ghost' }}
      title="Correct the count"
      description="Set how many are actually in this drawer."
      submitLabel="Save"
      canSubmit={validQuantity(quantity, undefined, 0)}
      onOpen={() => setQuantity(current)}
      onSubmit={() => attempt(() => setStock({ stockId, quantity }), 'Count updated')}
    >
      <QuantityInput value={quantity} onChange={setQuantity} min={0} />
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-destructive"
        onClick={() =>
          void attempt(() => removeStock({ stockId }), 'Removed from drawer')
        }
      >
        Stop storing this part here
      </Button>
    </ActionDialog>
  )
}

// --- Tracked items ---

export function CheckoutButton({ itemId }: { itemId: Id<'items'> }) {
  const checkout = useMutation(api.inventory.checkout)
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await attempt(() => checkout({ itemId }), 'Checked out to you')
        setBusy(false)
      }}
    >
      Check out
    </Button>
  )
}

export function CheckinButton({
  itemId,
  homeLabel,
  zoneId,
}: {
  itemId: Id<'items'>
  homeLabel: string
  zoneId?: Id<'zones'>
}) {
  const checkin = useMutation(api.inventory.checkin)
  const [elsewhere, setElsewhere] = useState(false)
  const [to, setTo] = useState<Id<'drawers'>>()
  return (
    <ActionDialog
      trigger="Return"
      triggerProps={{ variant: 'default' }}
      title="Return item"
      submitLabel="Return"
      wide={elsewhere}
      canSubmit={!elsewhere || !!to}
      onOpen={() => {
        setElsewhere(false)
        setTo(undefined)
      }}
      onSubmit={() =>
        attempt(
          () => checkin({ itemId, drawerId: elsewhere ? to : undefined }),
          'Returned',
        )
      }
    >
      {elsewhere ? (
        <DrawerPicker value={to} onChange={(id) => setTo(id)} initialZoneId={zoneId} />
      ) : (
        <div className="space-y-2 text-sm">
          <p>
            Put it back in <span className="font-medium">{homeLabel}</span>.
          </p>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => setElsewhere(true)}
          >
            Returning it to a different drawer?
          </Button>
        </div>
      )}
    </ActionDialog>
  )
}

export function MoveItemButton({
  itemId,
  zoneId,
}: {
  itemId: Id<'items'>
  zoneId?: Id<'zones'>
}) {
  const moveItem = useMutation(api.inventory.moveItem)
  const [to, setTo] = useState<Id<'drawers'>>()
  return (
    <ActionDialog
      trigger="Move"
      triggerProps={{ variant: 'ghost' }}
      title="Move item"
      submitLabel="Move"
      wide
      canSubmit={!!to}
      onOpen={() => setTo(undefined)}
      onSubmit={() => attempt(() => moveItem({ itemId, drawerId: to! }), 'Moved')}
    >
      <DrawerPicker value={to} onChange={(id) => setTo(id)} initialZoneId={zoneId} />
    </ActionDialog>
  )
}

export function AddItemButton({
  partId,
  partName,
  drawerId,
}: {
  partId: Id<'parts'>
  partName: string
  drawerId?: Id<'drawers'>
}) {
  const addItem = useMutation(api.inventory.addItem)
  const [label, setLabel] = useState('')
  const [to, setTo] = useState(drawerId)
  return (
    <ActionDialog
      trigger="Add unit"
      title={`Add a ${partName}`}
      submitLabel="Add"
      wide={!drawerId}
      canSubmit={!!to}
      onOpen={() => {
        setLabel('')
        setTo(drawerId)
      }}
      onSubmit={() => attempt(() => addItem({ partId, label, drawerId: to! }), 'Added')}
    >
      <div className="space-y-1.5">
        <Label htmlFor="item-label">Label</Label>
        <Input
          id="item-label"
          placeholder="e.g. #3 or serial number (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      {!drawerId && <DrawerPicker value={to} onChange={(id) => setTo(id)} />}
    </ActionDialog>
  )
}

export function RemoveItemButton({ itemId }: { itemId: Id<'items'> }) {
  const removeItem = useMutation(api.inventory.removeItem)
  return (
    <ActionDialog
      trigger="Remove"
      triggerProps={{ variant: 'ghost', className: 'text-destructive' }}
      title="Remove this unit?"
      description="Use this when an item is lost, broken or given away."
      submitLabel="Remove"
      onSubmit={() => attempt(() => removeItem({ itemId }), 'Removed')}
    />
  )
}
