import { ConvexError, v } from 'convex/values'
import { mutation } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { requireOfficer } from './lib/auth'
import { cellLabel, drawerIsEmpty } from './lib/locations'

const MAX_CELLS = 40

type Rect = { x: number; y: number; w: number; h: number }

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function checkInteger(value: number, min: number, max: number, what: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConvexError(`${what} must be between ${min} and ${max}`)
  }
}

/** Throws unless rect fits inside the zone without overlapping other units. */
async function checkPlacement(
  ctx: MutationCtx,
  zoneId: Id<'zones'>,
  rect: Rect,
  ignore?: Id<'units'>,
) {
  const zone = await ctx.db.get(zoneId)
  if (!zone) throw new ConvexError('Zone not found')
  checkInteger(rect.x, 0, zone.width - 1, 'X')
  checkInteger(rect.y, 0, zone.height - 1, 'Y')
  checkInteger(rect.w, 1, zone.width - rect.x, 'Width')
  checkInteger(rect.h, 1, zone.height - rect.y, 'Height')
  const others = await ctx.db
    .query('units')
    .withIndex('by_zone', (q) => q.eq('zoneId', zoneId))
    .collect()
  if (others.some((other) => other._id !== ignore && overlaps(rect, other))) {
    throw new ConvexError('Units can’t overlap')
  }
}

async function unitDrawers(ctx: MutationCtx, unitId: Id<'units'>) {
  return await ctx.db
    .query('drawers')
    .withIndex('by_unit', (q) => q.eq('unitId', unitId))
    .collect()
}

async function insertCells(
  ctx: MutationCtx,
  unitId: Id<'units'>,
  cells: Array<{ row: number; col: number }>,
) {
  for (const { row, col } of cells) {
    await ctx.db.insert('drawers', {
      unitId,
      row,
      col,
      rowSpan: 1,
      colSpan: 1,
      label: cellLabel(row, col),
    })
  }
}

function grid(rows: number, cols: number) {
  return Array.from({ length: rows * cols }, (_, i) => ({
    row: Math.floor(i / cols),
    col: i % cols,
  }))
}

export const create = mutation({
  args: {
    zoneId: v.id('zones'),
    name: v.string(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    rows: v.number(),
    cols: v.number(),
  },
  handler: async (ctx, { zoneId, name, rows, cols, ...rect }) => {
    await requireOfficer(ctx)
    await checkPlacement(ctx, zoneId, rect)
    checkInteger(rows, 1, MAX_CELLS, 'Rows')
    checkInteger(cols, 1, MAX_CELLS, 'Columns')
    const unitId = await ctx.db.insert('units', {
      zoneId,
      name: name.trim() || 'Untitled unit',
      rows,
      cols,
      ...rect,
    })
    await insertCells(ctx, unitId, grid(rows, cols))
    return unitId
  },
})

export const update = mutation({
  args: {
    unitId: v.id('units'),
    name: v.string(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
  },
  handler: async (ctx, { unitId, name, ...rect }) => {
    await requireOfficer(ctx)
    const unit = await ctx.db.get(unitId)
    if (!unit) throw new ConvexError('Unit not found')
    await checkPlacement(ctx, unit.zoneId, rect, unitId)
    await ctx.db.patch(unitId, { name: name.trim() || 'Untitled unit', ...rect })
  },
})

/** Changes the drawer grid. Only allowed while every drawer is empty. */
export const setGrid = mutation({
  args: { unitId: v.id('units'), rows: v.number(), cols: v.number() },
  handler: async (ctx, { unitId, rows, cols }) => {
    await requireOfficer(ctx)
    checkInteger(rows, 1, MAX_CELLS, 'Rows')
    checkInteger(cols, 1, MAX_CELLS, 'Columns')
    const drawers = await unitDrawers(ctx, unitId)
    for (const drawer of drawers) {
      if (!(await drawerIsEmpty(ctx, drawer._id))) {
        throw new ConvexError('Empty every drawer before changing the grid')
      }
    }
    for (const drawer of drawers) await ctx.db.delete(drawer._id)
    await ctx.db.patch(unitId, { rows, cols })
    await insertCells(ctx, unitId, grid(rows, cols))
  },
})

export const remove = mutation({
  args: { unitId: v.id('units') },
  handler: async (ctx, { unitId }) => {
    await requireOfficer(ctx)
    const drawers = await unitDrawers(ctx, unitId)
    for (const drawer of drawers) {
      if (!(await drawerIsEmpty(ctx, drawer._id))) {
        throw new ConvexError('Empty every drawer before removing the unit')
      }
    }
    for (const drawer of drawers) await ctx.db.delete(drawer._id)
    await ctx.db.delete(unitId)
  },
})

/**
 * Merges drawers that together form a rectangle. The top-left drawer survives
 * (so its QR label keeps working) and absorbs the others' contents.
 */
export const mergeDrawers = mutation({
  args: { drawerIds: v.array(v.id('drawers')) },
  handler: async (ctx, { drawerIds }) => {
    await requireOfficer(ctx)
    const drawers: Array<Doc<'drawers'>> = []
    for (const id of new Set(drawerIds)) {
      const drawer = await ctx.db.get(id)
      if (!drawer) throw new ConvexError('Drawer not found')
      drawers.push(drawer)
    }
    if (drawers.length < 2) throw new ConvexError('Pick at least two drawers')
    if (drawers.some((d) => d.unitId !== drawers[0].unitId)) {
      throw new ConvexError('Drawers must be in the same unit')
    }

    const top = Math.min(...drawers.map((d) => d.row))
    const left = Math.min(...drawers.map((d) => d.col))
    const bottom = Math.max(...drawers.map((d) => d.row + d.rowSpan))
    const right = Math.max(...drawers.map((d) => d.col + d.colSpan))
    const area = drawers.reduce((sum, d) => sum + d.rowSpan * d.colSpan, 0)
    const keep = drawers.find((d) => d.row === top && d.col === left)
    if (!keep || area !== (bottom - top) * (right - left)) {
      throw new ConvexError('Drawers must form a rectangle')
    }

    for (const drawer of drawers) {
      if (drawer._id === keep._id) continue
      const stock = await ctx.db
        .query('stock')
        .withIndex('by_drawer', (q) => q.eq('drawerId', drawer._id))
        .collect()
      for (const row of stock) {
        const existing = await ctx.db
          .query('stock')
          .withIndex('by_part_drawer', (q) =>
            q.eq('partId', row.partId).eq('drawerId', keep._id),
          )
          .unique()
        if (existing) {
          await ctx.db.patch(existing._id, {
            quantity: existing.quantity + row.quantity,
          })
          await ctx.db.delete(row._id)
        } else {
          await ctx.db.patch(row._id, { drawerId: keep._id })
        }
      }
      const items = await ctx.db
        .query('items')
        .withIndex('by_drawer', (q) => q.eq('drawerId', drawer._id))
        .collect()
      for (const item of items) await ctx.db.patch(item._id, { drawerId: keep._id })
      await ctx.db.delete(drawer._id)
    }
    await ctx.db.patch(keep._id, {
      rowSpan: bottom - top,
      colSpan: right - left,
    })
  },
})

/** Splits a merged drawer back into single cells; contents stay top-left. */
export const splitDrawer = mutation({
  args: { drawerId: v.id('drawers') },
  handler: async (ctx, { drawerId }) => {
    await requireOfficer(ctx)
    const drawer = await ctx.db.get(drawerId)
    if (!drawer) throw new ConvexError('Drawer not found')
    const cells = grid(drawer.rowSpan, drawer.colSpan)
      .slice(1)
      .map(({ row, col }) => ({ row: drawer.row + row, col: drawer.col + col }))
    await ctx.db.patch(drawerId, { rowSpan: 1, colSpan: 1 })
    await insertCells(ctx, drawer.unitId, cells)
  },
})

export const renameDrawer = mutation({
  args: { drawerId: v.id('drawers'), name: v.string() },
  handler: async (ctx, { drawerId, name }) => {
    await requireOfficer(ctx)
    await ctx.db.patch(drawerId, { name: name.trim() || undefined })
  },
})
