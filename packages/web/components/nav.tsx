import { signIn, signOut } from '../app/actions'
import Link from 'next/link'

const DEVELOPER = 'ada@dev.swagmoney.test'
const ADVERTISER = 'lin@ads.swagmoney.test'

export type NavCurrent =
  | 'developers'
  | 'advertisers'
  | 'integrations'
  | 'install'
  | 'advertise'
  | 'faq'
  | 'api'
  | 'login'

export function SiteNav({ current, signedIn = false }: { current?: NavCurrent; signedIn?: boolean }) {
  return (
    <header className="nav">
      <Link className="brand" href="/">
        <span className="mark">SM</span>
        <strong>Swag-Money</strong>
        <span>swagmoney.ai</span>
      </Link>
      <nav className="nav-links" aria-label="Primary">
        <Link href="/integrations" aria-current={current === 'integrations' ? 'page' : undefined}>Integrations</Link>
        <Link href="/install" aria-current={current === 'install' ? 'page' : undefined}>Install</Link>
        <Link href="/advertise" aria-current={current === 'advertise' ? 'page' : undefined}>Advertise</Link>
        <Link href="/developers" aria-current={current === 'developers' ? 'page' : undefined}>Developers</Link>
        <Link href="/faq" aria-current={current === 'faq' ? 'page' : undefined}>FAQ</Link>
        <Link href="/api-docs" aria-current={current === 'api' ? 'page' : undefined}>API</Link>
        {signedIn ? (
          <form action={signOut}>
            <button className="button secondary" type="submit">Sign out</button>
          </form>
        ) : (
          <Link className="button" href="/login" aria-current={current === 'login' ? 'page' : undefined}>Log in</Link>
        )}
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="wrap site-footer">
      <span>Swag-Money · swagmoney.ai</span>
      <span>
        <Link href="/faq">FAQ</Link>
        {' · '}
        <Link href="/surface-pricing">Pricing</Link>
        {' · '}
        <Link href="/api-docs">API</Link>
        {' · '}
        <Link href="/privacy">Privacy</Link>
        {' · '}
        <Link href="/terms">Terms</Link>
        {' · '}
        <Link href="/privacy-choices">Privacy choices</Link>
        {' · '}
        <Link href="/security">Security</Link>
      </span>
    </footer>
  )
}

export function DemoSwitch() {
  return (
    <div className="inline">
      <form action={signIn}>
        <input type="hidden" name="email" value={DEVELOPER} />
        <input type="hidden" name="next" value="developers" />
        <button className="button secondary" type="submit">Ada · developer</button>
      </form>
      <form action={signIn}>
        <input type="hidden" name="email" value={ADVERTISER} />
        <input type="hidden" name="next" value="advertisers" />
        <button className="button secondary" type="submit">Lin · advertiser</button>
      </form>
    </div>
  )
}
