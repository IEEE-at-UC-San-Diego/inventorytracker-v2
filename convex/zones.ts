import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireIdentity, requireOfficer } from './lib/auth'

const MAX_GRID = 64

function checkSize(width: number, height: number) {
  for (const n of [width, height]) {
    if (!Number.isInteger(n) || n < 1 || n > MAX_GRID) {
      throw new ConvexError(`Zone size must be between 1 and ${MAX_GRID}`)
    }
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    return await ctx.db.query('zones').withIndex('by_order').collect()
  },
})

/** A zone with its units and drawers, plus how many things are in each drawer. */
export const layout = query({
  args: { zoneId: v.id('zones') },
  handler: async (ctx, { zoneId }) => {
    await requireIdentity(ctx)
    const zone = await ctx.db.get(zoneId)
    if (!zone) return null
    const units = await ctx.db
      .query('units')
      .withIndex('by_zone', (q) => q.eq('zoneId', zoneId))
      .collect()
    return {
      zone,
      units: await Promise.all(
        units.map(async (unit) => {
          const drawers = await ctx.db
            .query('drawers')
            .withIndex('by_unit', (q) => q.eq('unitId', unit._id))
            .collect()
          return {
            ...unit,
            drawers: await Promise.all(
              drawers.map(async (drawer) => {
                const stock = await ctx.db
                  .query('stock')
                  .withIndex('by_drawer', (q) => q.eq('drawerId', drawer._id))
                  .collect()
                const items = await ctx.db
                  .query('items')
                  .withIndex('by_drawer', (q) => q.eq('drawerId', drawer._id))
                  .collect()
                return { ...drawer, count: stock.length + items.length }
              }),
            ),
          }
        }),
      ),
    }
  },
})

export const create = mutation({
  args: { name: v.string(), width: v.number(), height: v.number() },
  handler: async (ctx, { name, width, height }) => {
    await requireOfficer(ctx)
    checkSize(width, height)
    const last = await ctx.db
      .query('zones')
      .withIndex('by_order')
      .order('desc')
      .first()
    return await ctx.db.insert('zones', {
      name: name.trim() || 'Untitled zone',
      order: (last?.order ?? 0) + 1,
      width,
      height,
    })
  },
})

export const update = mutation({
  args: {
    zoneId: v.id('zones'),
    name: v.string(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, { zoneId, name, width, height }) => {
    await requireOfficer(ctx)
    checkSize(width, height)
    const units = await ctx.db
      .query('units')
      .withIndex('by_zone', (q) => q.eq('zoneId', zoneId))
      .collect()
    if (units.some((u) => u.x + u.w > width || u.y + u.h > height)) {
      throw new ConvexError('Some units would fall outside the zone')
    }
    await ctx.db.patch(zoneId, { name: name.trim() || 'Untitled zone', width, height })
  },
})

export const remove = mutation({
  args: { zoneId: v.id('zones') },
  handler: async (ctx, { zoneId }) => {
    await requireOfficer(ctx)
    const unit = await ctx.db
      .query('units')
      .withIndex('by_zone', (q) => q.eq('zoneId', zoneId))
      .first()
    if (unit) throw new ConvexError('Remove the units in this zone first')
    await ctx.db.delete(zoneId)
  },
})

/** Swap a zone with its neighbour in the overview strip. */
export const reorder = mutation({
  args: { zoneId: v.id('zones'), direction: v.union(v.literal(-1), v.literal(1)) },
  handler: async (ctx, { zoneId, direction }) => {
    await requireOfficer(ctx)
    const zones = await ctx.db.query('zones').withIndex('by_order').collect()
    const index = zones.findIndex((z) => z._id === zoneId)
    const other = zones[index + direction] as (typeof zones)[number] | undefined
    if (index === -1 || !other) return
    await ctx.db.patch(zoneId, { order: other.order })
    await ctx.db.patch(other._id, { order: zones[index].order })
  },
})
