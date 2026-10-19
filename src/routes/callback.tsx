import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useHandleSignInCallback } from '@logto/react'
import { Centered } from '#/components/app-shell'
import { takeReturnTo } from '#/integrations/auth'

export const Route = createFileRoute('/callback')({ component: Callback })

function Callback() {
  const navigate = useNavigate()
  const { error } = useHandleSignInCallback(() => {
    void navigate({ href: takeReturnTo(), replace: true })
  })

  return (
    <Centered>
      {error ? (
        <>
          <p className="text-sm">Sign-in didn’t complete: {error.message}</p>
          <a href="/" className="text-sm text-primary underline">
            Try again
          </a>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      )}
    </Centered>
  )
}
