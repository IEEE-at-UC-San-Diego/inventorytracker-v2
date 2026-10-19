import { mutation, query } from './_generated/server'
import { isOfficer, requireIdentity, requireUser } from './lib/auth'

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    return {
      name: identity.name ?? identity.email ?? 'Member',
      email: identity.email,
      isOfficer: isOfficer(identity),
    }
  },
})

/** Called on sign-in so the member's name is cached before they hold anything. */
export const sync = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
  },
})
