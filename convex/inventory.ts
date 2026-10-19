import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  findUser,
  isOfficer,
  requireIdentity,
  requireOfficer,
  requireUser,
} from './lib/auth'
import { createLocator } from './lib/locations'

function checkQuantity(quantity: number, allowZero = false) {
  if (!Number.isInteger(quantity) || quantity < (allowZero ? 0 : 1)) {
    throw new ConvexError(`Quantity must be a whole number${allowZero ? '' : ' above 0'}`)
  }
}

async function bulkPart(ctx: MutationCtx, partId: Id<'parts'>) {
  const part = await ctx.db.get(partId)
  if (!part) throw new ConvexError('Part not found')
  if (part.kind !== 'bulk') throw new ConvexError('This part is tracked individually')
  return part
}

async function requireDrawer(ctx: MutationCtx, drawerId: Id<'drawers'>) {
  if (!(await ctx.db.get(drawerId))) throw new ConvexError('Drawer not found')
}

async function stockRow(
  ctx: MutationCtx,
  partId: Id<'parts'>,
  drawerId: Id<'drawers'>,
) {
  return await ctx.db
    .query('stock')
    .withIndex('by_part_drawer', (q) =>
      q.eq('partId', partId).eq('drawerId', drawerId),
    )
    .unique()
}

async function addStock(
  ctx: MutationCtx,
  partId: Id<'parts'>,
  drawerId: Id<'drawers'>,
  quantity: number,
) {
  const row = await stockRow(ctx, partId, drawerId)
  if (row) {
    await ctx.db.patch(row._id, { quantity: row.quantity + quantity })
  } else {
    await ctx.db.insert('stock', { partId, drawerId, quantity })
  }
}

// --- Bulk parts ---

/** Take consumables from a drawer. Nothing is expected back. */
export const take = mutation({
  args: { partId: v.id('parts'), drawerId: v.id('drawers'), quantity: v.number() },
  handler: async (ctx, { partId, drawerId, quantity }) => {
    const { userId } = await requireUser(ctx)
    checkQuantity(quantity)
    await bulkPart(ctx, partId)
    const row = await stockRow(ctx, partId, drawerId)
    if (!row || row.quantity < quantity) {
      throw new ConvexError(`Only ${row?.quantity ?? 0} left in this drawer`)
    }
    // Keep empty rows so the part's home drawer is still known.
    await ctx.db.patch(row._id, { quantity: row.quantity - quantity })
    await ctx.db.insert('events', {
      userId,
      action: 'take',
      partId,
      quantity,
      fromDrawerId: drawerId,
    })
  },
})

export const moveStock = mutation({
  args: {
    partId: v.id('parts'),
    fromDrawerId: v.id('drawers'),
    toDrawerId: v.id('drawers'),
    quantity: v.number(),
  },
  handler: async (ctx, { partId, fromDrawerId, toDrawerId, quantity }) => {
    const { userId } = await requireUser(ctx)
    checkQuantity(quantity)
    await bulkPart(ctx, partId)
    await requireDrawer(ctx, toDrawerId)
    if (fromDrawerId === toDrawerId) throw new ConvexError('Pick a different drawer')
    const row = await stockRow(ctx, partId, fromDrawerId)
    if (!row || row.quantity < quantity) {
      throw new ConvexError(`Only ${row?.quantity ?? 0} in that drawer`)
    }
    if (row.quantity === quantity) {
      await ctx.db.delete(row._id)
    } else {
      await ctx.db.patch(row._id, { quantity: row.quantity - quantity })
    }
    await addStock(ctx, partId, toDrawerId, quantity)
    await ctx.db.insert('events', {
      userId,
      action: 'move',
      partId,
      quantity,
      fromDrawerId,
      toDrawerId,
    })
  },
})

export const restock = mutation({
  args: { partId: v.id('parts'), drawerId: v.id('drawers'), quantity: v.number() },
  handler: async (ctx, { partId, drawerId, quantity }) => {
    const { userId } = await requireOfficer(ctx)
    checkQuantity(quantity)
    await bulkPart(ctx, partId)
    await requireDrawer(ctx, drawerId)
    await addStock(ctx, partId, drawerId, quantity)
    await ctx.db.insert('events', {
      userId,
      action: 'restock',
      partId,
      quantity,
      toDrawerId: drawerId,
    })
  },
})

/** Correct the count in a drawer after a recount. */
export const setStock = mutation({
  args: { stockId: v.id('stock'), quantity: v.number() },
  handler: async (ctx, { stockId, quantity }) => {
    const { userId } = await requireOfficer(ctx)
    checkQuantity(quantity, true)
    const row = await ctx.db.get(stockId)
    if (!row) throw new ConvexError('Stock not found')
    await ctx.db.patch(stockId, { quantity })
    await ctx.db.insert('events', {
      userId,
      action: 'adjust',
      partId: row.partId,
      quantity,
      toDrawerId: row.drawerId,
    })
  },
})

/** Stop storing a part in a drawer. */
export const removeStock = mutation({
  args: { stockId: v.id('stock') },
  handler: async (ctx, { stockId }) => {
    const { userId } = await requireOfficer(ctx)
    const row = await ctx.db.get(stockId)
    if (!row) return
    await ctx.db.delete(stockId)
    await ctx.db.insert('events', {
      userId,
      action: 'adjust',
      partId: row.partId,
      quantity: 0,
      fromDrawerId: row.drawerId,
    })
  },
})

// --- Tracked items ---

export const addItem = mutation({
  args: { partId: v.id('parts'), label: v.string(), drawerId: v.id('drawers') },
  handler: async (ctx, { partId, label, drawerId }) => {
    await requireOfficer(ctx)
    const part = await ctx.db.get(partId)
    if (!part) throw new ConvexError('Part not found')
    if (part.kind !== 'tracked') throw new ConvexError('This part is counted in bulk')
    await requireDrawer(ctx, drawerId)
    const count = (
      await ctx.db
        .query('items')
        .withIndex('by_part', (q) => q.eq('partId', partId))
        .collect()
    ).length
    return await ctx.db.insert('items', {
      partId,
      label: label.trim() || `#${count + 1}`,
      drawerId,
    })
  },
})

export const removeItem = mutation({
  args: { itemId: v.id('items') },
  handler: async (ctx, { itemId }) => {
    await requireOfficer(ctx)
    const item = await ctx.db.get(itemId)
    if (item?.holderId) throw new ConvexError('Check this item in first')
    if (item) await ctx.db.delete(itemId)
  },
})

export const checkout = mutation({
  args: { itemId: v.id('items') },
  handler: async (ctx, { itemId }) => {
    const { userId } = await requireUser(ctx)
    const item = await ctx.db.get(itemId)
    if (!item) throw new ConvexError('Item not found')
    if (item.holderId) throw new ConvexError('Already checked out')
    await ctx.db.patch(itemId, { holderId: userId, checkedOutAt: Date.now() })
    await ctx.db.insert('events', {
      userId,
      action: 'checkout',
      partId: item.partId,
      itemId,
      fromDrawerId: item.drawerId,
    })
  },
})

/** Return an item, optionally to a different drawer than it came from. */
export const checkin = mutation({
  args: { itemId: v.id('items'), drawerId: v.optional(v.id('drawers')) },
  handler: async (ctx, { itemId, drawerId }) => {
    const { identity, userId } = await requireUser(ctx)
    const item = await ctx.db.get(itemId)
    if (!item) throw new ConvexError('Item not found')
    if (!item.holderId) throw new ConvexError('Not checked out')
    if (item.holderId !== userId && !isOfficer(identity)) {
      throw new ConvexError('Only the holder or an officer can return this')
    }
    const to = drawerId ?? item.drawerId
    await requireDrawer(ctx, to)
    await ctx.db.patch(itemId, {
      drawerId: to,
      holderId: undefined,
      checkedOutAt: undefined,
    })
    await ctx.db.insert('events', {
      userId,
      action: 'checkin',
      partId: item.partId,
      itemId,
      toDrawerId: to,
    })
  },
})

export const moveItem = mutation({
  args: { itemId: v.id('items'), drawerId: v.id('drawers') },
  handler: async (ctx, { itemId, drawerId }) => {
    const { userId } = await requireUser(ctx)
    const item = await ctx.db.get(itemId)
    if (!item) throw new ConvexError('Item not found')
    await requireDrawer(ctx, drawerId)
    if (item.drawerId === drawerId) return
    await ctx.db.patch(itemId, { drawerId })
    await ctx.db.insert('events', {
      userId,
      action: 'move',
      partId: item.partId,
      itemId,
      fromDrawerId: item.drawerId,
      toDrawerId: drawerId,
    })
  },
})

/** Items the signed-in member currently holds. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const me = await findUser(ctx, identity)
    if (!me) return []
    const items = await ctx.db
      .query('items')
      .withIndex('by_holder', (q) => q.eq('holderId', me._id))
      .collect()
    const locate = createLocator(ctx)
    return await Promise.all(
      items.map(async (item) => ({
        ...item,
        part: await ctx.db.get(item.partId),
        location: await locate(item.drawerId),
      })),
    )
  },
})

/** Every checked-out item, for officers chasing things down. */
export const checkedOut = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    if (!isOfficer(identity)) return []
    const items = (await ctx.db.query('items').collect()).filter((i) => i.holderId)
    return await Promise.all(
      items.map(async (item) => {
        const holder = item.holderId && (await ctx.db.get(item.holderId))
        return {
          ...item,
          part: await ctx.db.get(item.partId),
          holderName: holder ? holder.name : 'Unknown member',
        }
      }),
    )
  },
})
