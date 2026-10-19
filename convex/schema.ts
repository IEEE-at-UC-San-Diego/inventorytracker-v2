import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const partKind = v.union(v.literal('bulk'), v.literal('tracked'))

export const eventAction = v.union(
  v.literal('take'),
  v.literal('restock'),
  v.literal('adjust'),
  v.literal('move'),
  v.literal('checkout'),
  v.literal('checkin'),
)

export default defineSchema({
  // Cached Logto profile so we can show who holds what.
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
  }).index('by_token', ['tokenIdentifier']),

  // A wall or table in the space, drawn as a front-on grid.
  zones: defineTable({
    name: v.string(),
    order: v.number(),
    width: v.number(),
    height: v.number(),
  }).index('by_order', ['order']),

  // A storage unit placed on its zone's grid, divided into rows x cols cells.
  units: defineTable({
    zoneId: v.id('zones'),
    name: v.string(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    rows: v.number(),
    cols: v.number(),
  }).index('by_zone', ['zoneId']),

  // One or more merged cells of a unit. This is what QR labels point at.
  drawers: defineTable({
    unitId: v.id('units'),
    row: v.number(),
    col: v.number(),
    rowSpan: v.number(),
    colSpan: v.number(),
    label: v.string(),
    name: v.optional(v.string()),
  }).index('by_unit', ['unitId']),

  parts: defineTable({
    name: v.string(),
    kind: partKind,
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    lowStock: v.optional(v.number()),
    searchText: v.string(),
  })
    .index('by_name', ['name'])
    .searchIndex('search', { searchField: 'searchText' }),

  // Quantity of a bulk part in a drawer.
  stock: defineTable({
    partId: v.id('parts'),
    drawerId: v.id('drawers'),
    quantity: v.number(),
  })
    .index('by_part', ['partId'])
    .index('by_drawer', ['drawerId'])
    .index('by_part_drawer', ['partId', 'drawerId']),

  // One physical unit of a tracked part. drawerId is where it lives.
  items: defineTable({
    partId: v.id('parts'),
    label: v.string(),
    drawerId: v.id('drawers'),
    holderId: v.optional(v.id('users')),
    checkedOutAt: v.optional(v.number()),
  })
    .index('by_part', ['partId'])
    .index('by_drawer', ['drawerId'])
    .index('by_holder', ['holderId']),

  events: defineTable({
    userId: v.id('users'),
    action: eventAction,
    partId: v.id('parts'),
    itemId: v.optional(v.id('items')),
    quantity: v.optional(v.number()),
    fromDrawerId: v.optional(v.id('drawers')),
    toDrawerId: v.optional(v.id('drawers')),
  })
    .index('by_part', ['partId'])
    .index('by_user', ['userId']),
})
