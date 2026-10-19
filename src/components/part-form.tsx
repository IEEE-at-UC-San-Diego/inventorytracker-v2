import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useNavigate } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
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
import { Textarea } from '#/components/ui/textarea'
import { attempt } from '#/lib/errors'
import { cn } from '#/lib/utils'

type Kind = Doc<'parts'>['kind']

const kinds: Array<{ value: Kind; title: string; hint: string }> = [
  { value: 'bulk', title: 'Counted', hint: 'Resistors, LEDs, wire. Taking one uses it up.' },
  { value: 'tracked', title: 'Tracked', hint: 'Arduinos, tools. Each unit is checked out and returned.' },
]

/** Create a part, or edit one when `part` is given. Officers only. */
export function PartFormButton({ part }: { part?: Doc<'parts'> }) {
  const create = useMutation(api.parts.create)
  const update = useMutation(api.parts.update)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(() => initial(part))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const fields = {
      name: form.name,
      category: form.category,
      notes: form.notes,
      lowStock: form.lowStock === '' ? undefined : Number(form.lowStock),
    }
    let createdId: string | undefined
    const ok = await attempt(async () => {
      if (part) await update({ partId: part._id, ...fields })
      else createdId = await create({ kind: form.kind, ...fields })
    }, part ? 'Saved' : 'Part added')
    setBusy(false)
    if (!ok) return
    setOpen(false)
    if (createdId) {
      void navigate({ to: '/parts/$partId', params: { partId: createdId } })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(initial(part))
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={part ? 'outline' : 'default'}>
          {part ? 'Edit' : 'New part'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{part ? 'Edit part' : 'New part'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="part-name">Name</Label>
            <Input
              id="part-name"
              autoFocus
              placeholder="e.g. 10kΩ resistor"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          {!part && (
            <div className="grid grid-cols-2 gap-2">
              {kinds.map((kind) => (
                <button
                  key={kind.value}
                  type="button"
                  onClick={() => setForm({ ...form, kind: kind.value })}
                  className={cn(
                    'rounded-md border p-3 text-left text-sm',
                    form.kind === kind.value
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'hover:border-primary/50',
                  )}
                >
                  <span className="font-medium">{kind.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {kind.hint}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="part-category">Category</Label>
              <Input
                id="part-category"
                placeholder="e.g. Resistors"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="part-low">Low when at or below</Label>
              <Input
                id="part-low"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Optional"
                value={form.lowStock}
                onChange={(e) => setForm({ ...form, lowStock: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="part-notes">Notes</Label>
            <Textarea
              id="part-notes"
              placeholder="Specs, part numbers, datasheet link…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !form.name.trim()}>
              {part ? 'Save' : 'Add part'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function initial(part?: Doc<'parts'>) {
  return {
    name: part?.name ?? '',
    kind: part?.kind ?? 'bulk',
    category: part?.category ?? '',
    notes: part?.notes ?? '',
    lowStock: part?.lowStock?.toString() ?? '',
  }
}
