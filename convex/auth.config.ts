import type { AuthConfig } from 'convex/server'

// Convex validates Logto ID tokens directly. This requires the Logto tenant to
// sign with RS256 (`${LOGTO_ENDPOINT}/oidc/jwks` should list "kty": "RSA").
const endpoint = process.env.LOGTO_ENDPOINT?.trim().replace(/\/+$/, '')
const applicationID = process.env.LOGTO_APP_ID?.trim()

if (!endpoint) throw new Error('Missing LOGTO_ENDPOINT')
if (!applicationID) throw new Error('Missing LOGTO_APP_ID')

export default {
  providers: [
    {
      // Must match the ID token `iss` claim.
      domain: endpoint.endsWith('/oidc') ? endpoint : `${endpoint}/oidc`,
      applicationID,
    },
  ],
} satisfies AuthConfig
