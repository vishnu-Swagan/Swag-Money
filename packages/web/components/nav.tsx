import { signIn, signOut } from '../app/actions'
import Link from 'next/link'

const DEVELOPER = 'ada@dev.swagmoney.test'
const ADVERTISER = 'lin@ads.swagmoney.test'

export function SiteNav({ current, signedIn = false }: { current?: 'developers' | 'advertisers'; signedIn?: boolean }) {
  return (
    <header className="nav">
      <Link className="brand" href="/">
        <span className="mark">SM</span>
        <strong>Swag-Money</strong>
        <span>swagmoney.ai</span>
      </Link>
      <nav className="nav-links" aria-label="Primary">
        <a href="/#security">Security</a>
        <a href="/#auction">Auction</a>
        <Link href="/developers" aria-current={current === 'developers' ? 'page' : undefined}>Developers</Link>
        <Link href="/advertisers" aria-current={current === 'advertisers' ? 'page' : undefined}>Advertisers</Link>
        {signedIn ? (
          <form action={signOut}>
            <button className="button secondary" type="submit">Sign out</button>
          </form>
        ) : (
          <>
            <form action={signIn}>
              <input type="hidden" name="email" value={DEVELOPER} />
              <button className="button" type="submit">Enter as Ada</button>
            </form>
            <form action={signIn}>
              <input type="hidden" name="email" value={ADVERTISER} />
              <button className="button secondary" type="submit">Enter as Lin</button>
            </form>
          </>
        )}
      </nav>
    </header>
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
