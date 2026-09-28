/** Local `pnpm dev` only. Hosted deployments never expose the Ada/Lin demo sessions. */
export function demoAccountsEnabled(): boolean {
  if (process.env.SWAG_ENV === 'production' || process.env.VERCEL) return false
  return process.env.SWAG_ALLOW_DEMO !== '0'
}
