import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '#/components/app-shell'

// Every page except /callback requires sign-in. Data access is enforced by the
// Convex functions themselves; this gate is only for the UI.
export const Route = createFileRoute('/_app')({ component: AuthGate })
