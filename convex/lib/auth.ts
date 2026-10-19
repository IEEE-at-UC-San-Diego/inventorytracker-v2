import { ConvexError } from 'convex/values'
import type { UserIdentity } from 'convex/server'
import type { MutationCtx, QueryCtx } from '../_generated/server'

// Logto roles that can edit parts, layouts and stock counts.
const OFFICER_ROLES = ['General Officer', 'Executive Officer', 'Administrator']

export function isOfficer(identity: UserIdentity) {
  const roles = identity.roles
  return (
    Array.isArray(roles) &&
    roles.some((role) => typeof role === 'string' && OFFICER_ROLES.includes(role))
  )
}

function displayName(identity: UserIdentity) {
  const username =
    typeof identity.username === 'string' ? identity.username : undefined
  return identity.name ?? username ?? identity.email ?? 'Unknown member'
}

export async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new ConvexError('Not signed in')
  return identity
}

export async function findUser(ctx: QueryCtx, identity: UserIdentity) {
  return await ctx.db
    .query('users')
    .withIndex('by_token', (q) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier),
    )
    .unique()
}

/** Returns the signed-in user's id, creating or refreshing their profile. */
export async function requireUser(ctx: MutationCtx) {
  const identity = await requireIdentity(ctx)
  const profile = { name: displayName(identity), email: identity.email }
  const user = await findUser(ctx, identity)
  if (!user) {
    const userId = await ctx.db.insert('users', {
      tokenIdentifier: identity.tokenIdentifier,
      ...profile,
    })
    return { identity, userId }
  }
  if (user.name !== profile.name || user.email !== profile.email) {
    await ctx.db.patch(user._id, profile)
  }
  return { identity, userId: user._id }
}

export async function requireOfficer(ctx: MutationCtx) {
  const result = await requireUser(ctx)
  if (!isOfficer(result.identity)) throw new ConvexError('Officers only')
  return result
}
