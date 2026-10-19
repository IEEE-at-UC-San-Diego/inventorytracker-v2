import { ConvexError } from 'convex/values'
import { toast } from 'sonner'

export function errorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === 'string') {
    return error.data
  }
  return 'Something went wrong. Try again.'
}

/** Runs a mutation, toasting the error if it fails. Resolves to success. */
export async function attempt(run: () => Promise<unknown>, success?: string) {
  try {
    await run()
    if (success) toast.success(success)
    return true
  } catch (error) {
    toast.error(errorMessage(error))
    return false
  }
}
