import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'

export type Location = {
  drawerId: Id<'drawers'>
  drawerLabel: string
  drawerName?: string
  unitId: Id<'units'>
  unitName: string
  zoneId: Id<'zones'>
  zoneName: string
}

/** Resolves drawer ids to zone/unit/drawer names, caching lookups per call. */
export function createLocator(ctx: QueryCtx) {
  const units = new Map<Id<'units'>, Promise<Doc<'units'> | null>>()
  const zones = new Map<Id<'zones'>, Promise<Doc<'zones'> | null>>()

  function cached<T extends 'units' | 'zones'>(
    map: Map<Id<T>, Promise<Doc<T> | null>>,
    id: Id<T>,
  ) {
    let doc = map.get(id)
    if (!doc) {
      doc = ctx.db.get(id)
      map.set(id, doc)
    }
    return doc
  }

  return async function locate(
    drawerId: Id<'drawers'>,
  ): Promise<Location | null> {
    const drawer = await ctx.db.get(drawerId)
    if (!drawer) return null
    const unit = await cached(units, drawer.unitId)
    if (!unit) return null
    const zone = await cached(zones, unit.zoneId)
    if (!zone) return null
    return {
      drawerId,
      drawerLabel: drawer.label,
      drawerName: drawer.name,
      unitId: unit._id,
      unitName: unit.name,
      zoneId: zone._id,
      zoneName: zone.name,
    }
  }
}

/** Spreadsheet-style cell label: row 0, col 0 is "A1". */
export function cellLabel(row: number, col: number) {
  let letters = ''
  for (let n = row + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  }
  return `${letters}${col + 1}`
}

export async function drawerIsEmpty(ctx: QueryCtx, drawerId: Id<'drawers'>) {
  const stock = await ctx.db
    .query('stock')
    .withIndex('by_drawer', (q) => q.eq('drawerId', drawerId))
    .first()
  if (stock) return false
  const item = await ctx.db
    .query('items')
    .withIndex('by_drawer', (q) => q.eq('drawerId', drawerId))
    .first()
  return !item
}
