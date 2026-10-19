import { v } from 'convex/values'
import { query } from './_generated/server'
import { findUser, requireIdentity } from './lib/auth'
import { createLocator } from './lib/locations'

/** Everything the drawer page (and QR scans) needs. */
export const get = query({
  args: { drawerId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const drawerId = ctx.db.normalizeId('drawers', args.drawerId)
    const drawer = drawerId && (await ctx.db.get(drawerId))
    if (!drawer) return null
    const location = await createLocator(ctx)(drawer._id)
    const unit = await ctx.db.get(drawer.unitId)
    if (!location || !unit) return null
    const me = await findUser(ctx, identity)

    const unitDrawers = await ctx.db
      .query('drawers')
      .withIndex('by_unit', (q) => q.eq('unitId', unit._id))
      .collect()
    const stock = await ctx.db
      .query('stock')
      .withIndex('by_drawer', (q) => q.eq('drawerId', drawer._id))
      .collect()
    const items = await ctx.db
      .query('items')
      .withIndex('by_drawer', (q) => q.eq('drawerId', drawer._id))
      .collect()

    return {
      drawer,
      location,
      unit: { ...unit, drawers: unitDrawers },
      stock: (
        await Promise.all(
          stock.map(async (row) => {
            const part = await ctx.db.get(row.partId)
            return part && { _id: row._id, quantity: row.quantity, part }
          }),
        )
      ).filter((row) => row !== null),
      items: (
        await Promise.all(
          items.map(async (item) => {
            const part = await ctx.db.get(item.partId)
            const holder = item.holderId && (await ctx.db.get(item.holderId))
            return (
              part && {
                ...item,
                part,
                holderName: holder ? holder.name : null,
                heldByMe: !!me && item.holderId === me._id,
              }
            )
          }),
        )
      ).filter((item) => item !== null),
    }
  },
})
