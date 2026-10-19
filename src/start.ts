import { createStart } from '@tanstack/react-start'

// Auth lives in the browser (Logto + Convex websocket), so pages render
// client-side. The server only sends the document shell.
export const startInstance = createStart(() => ({
  defaultSsr: false,
}))
