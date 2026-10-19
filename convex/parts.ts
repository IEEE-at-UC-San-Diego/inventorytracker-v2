import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { findUser, requireIdentity, requireOfficer } from './lib/auth'
import { createLocator } from './lib/locations'
import type { Location } from './lib/locations'
import { partKind } from './schema'

function searchText(fields: { name: string; category?: string; notes?: string }) {
  return [fields.name, fields.category, fields.notes].filter(Boolean).join(' ')
}

function clean(value: string | undefined) {
  return value?.trim() || undefined
}

function checkLowStock(lowStock: number | undefined) {
  if (lowStock !== undefined && (!Number.isInteger(lowStock) || lowStock < 0)) {
    throw new ConvexError('Low-stock level must be a whole number')
  }
}

/** Totals and locations for a part, as shown in search results. */
async function summarize(
  ctx: QueryCtx,
  part: Doc<'parts'>,
  locate: ReturnType<typeof createLocator>,
) {
  const counts = new Map<string, { location: Location; quantity: number }>()
  let total = 0
  let available = 0

  async function add(drawerId: Doc<'stock'>['drawerId'], quantity: number) {
    const existing = counts.get(drawerId)
    if (existing) {
      existing.quantity += quantity
      return
    }
    const location = await locate(drawerId)
    if (location) counts.set(drawerId, { location, quantity })
  }

  if (part.kind === 'bulk') {
    const stock = await ctx.db
      .query('stock')
      .withIndex('by_part', (q) => q.eq('partId', part._id))
      .collect()
    for (const row of stock) {
      total += row.quantity
      await add(row.drawerId, row.quantity)
    }
    available = total
  } else {
    const items = await ctx.db
      .query('items')
      .withIndex('by_part', (q) => q.eq('partId', part._id))
      .collect()
    for (const item of items) {
      total += 1
      if (!item.holderId) available += 1
      await add(item.drawerId, item.holderId ? 0 : 1)
    }
  }

  return {
    part,
    total,
    available,
    low: part.lowStock !== undefined && available <= part.lowStock,
    locations: [...counts.values()],
  }
}

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const text = args.query.trim()
    const parts = text
      ? await ctx.db
          .query('parts')
          .withSearchIndex('search', (q) => q.search('searchText', text))
          .take(50)
      : await ctx.db.query('parts').withIndex('by_name').take(200)
    const locate = createLocator(ctx)
    return await Promise.all(parts.map((part) => summarize(ctx, part, locate)))
  },
})

export const get = query({
  args: { partId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const partId = ctx.db.normalizeId('parts', args.partId)
    const part = partId && (await ctx.db.get(partId))
    if (!part) return null
    const locate = createLocator(ctx)
    const me = await findUser(ctx, identity)

    const stock = await ctx.db
      .query('stock')
      .withIndex('by_part', (q) => q.eq('partId', part._id))
      .collect()
    const items = await ctx.db
      .query('items')
      .withIndex('by_part', (q) => q.eq('partId', part._id))
      .collect()
    const events = await ctx.db
      .query('events')
      .withIndex('by_part', (q) => q.eq('partId', part._id))
      .order('desc')
      .take(25)

    return {
      ...(await summarize(ctx, part, locate)),
      stock: await Promise.all(
        stock.map(async (row) => ({ ...row, location: await locate(row.drawerId) })),
      ),
      items: await Promise.all(
        items.map(async (item) => {
          const holder = item.holderId && (await ctx.db.get(item.holderId))
          return {
            ...item,
            location: await locate(item.drawerId),
            holderName: holder ? holder.name : null,
            heldByMe: !!me && item.holderId === me._id,
          }
        }),
      ),
      events: await Promise.all(
        events.map(async (event) => {
          const user = await ctx.db.get(event.userId)
          const item = event.itemId && (await ctx.db.get(event.itemId))
          return {
            ...event,
            userName: user?.name ?? 'Unknown member',
            itemLabel: item ? item.label : undefined,
            from: event.fromDrawerId && (await locate(event.fromDrawerId)),
            to: event.toDrawerId && (await locate(event.toDrawerId)),
          }
        }),
      ),
    }
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    kind: partKind,
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    lowStock: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOfficer(ctx)
    const name = args.name.trim()
    if (!name) throw new ConvexError('Name is required')
    checkLowStock(args.lowStock)
    const fields = {
      name,
      kind: args.kind,
      category: clean(args.category),
      notes: clean(args.notes),
      lowStock: args.lowStock,
    }
    return await ctx.db.insert('parts', { ...fields, searchText: searchText(fields) })
  },
})

export const update = mutation({
  args: {
    partId: v.id('parts'),
    name: v.string(),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    lowStock: v.optional(v.number()),
  },
  handler: async (ctx, { partId, ...args }) => {
    await requireOfficer(ctx)
    const name = args.name.trim()
    if (!name) throw new ConvexError('Name is required')
    checkLowStock(args.lowStock)
    const fields = {
      name,
      category: clean(args.category),
      notes: clean(args.notes),
      lowStock: args.lowStock,
    }
    await ctx.db.patch(partId, { ...fields, searchText: searchText(fields) })
  },
})

export const remove = mutation({
  args: { partId: v.id('parts') },
  handler: async (ctx, { partId }) => {
    await requireOfficer(ctx)
    const items = await ctx.db
      .query('items')
      .withIndex('by_part', (q) => q.eq('partId', partId))
      .collect()
    if (items.some((item) => item.holderId)) {
      throw new ConvexError('Some items are still checked out')
    }
    const stock = await ctx.db
      .query('stock')
      .withIndex('by_part', (q) => q.eq('partId', partId))
      .collect()
    const events = await ctx.db
      .query('events')
      .withIndex('by_part', (q) => q.eq('partId', partId))
      .collect()
    for (const doc of [...items, ...stock, ...events]) await ctx.db.delete(doc._id)
    await ctx.db.delete(partId)
  },
})
