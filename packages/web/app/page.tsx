import { formatUsd } from '@swag-money/shared'
import Link from 'next/link'
import { BuyForm } from '../components/buy-form'
import { CopyCommand } from '../components/copy-command'
import { SiteFooter, SiteNav } from '../components/nav'
import { api, apiJson } from '../lib/api'
import { demoAccountsEnabled } from '../lib/demo'
import { COMPARE_NOTE, COMPARE_ROWS } from '../lib/compare'
import { signIn } from './actions'

export const dynamic = 'force-dynamic'

type PublicStats = {
  verifiedImpressions: number
  developerEarningsCents: number
  paidOutCents: number
  developerCount: number
  developerShareBps: number
  source: string
}

const DEVELOPER = 'ada@dev.swagmoney.test'
const ADVERTISER = 'lin@ads.swagmoney.test'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const query = await searchParams
  const stats = await loadStats()
  const me = await apiJson<{ role: string }>('/v1/me')
  return (
    <>
      <SiteNav signedIn={me.ok} />
      <main id="content">
        <section className="wrap hero">
          <div>
            <p className="kicker">Developer-tool ad marketplace</p>
            <h1>Signed ads for the seconds your AI <em>spends thinking.</em></h1>
            <p className="dek">
              Swag-Money sells one line of B2B copy into the wait state of the coding tools you already run.
              Advertisers bid in an English auction. The developer whose machine rendered the line earns the configured share, 50% unless you change it.
              The client never downloads code, and it never reads your prompts.
            </p>
            <LedgerStrip stats={stats} />
            <CopyCommand command="pnpm swag-money" />
            <p className="tiny">Detects installed tools and writes their official config. The same binary is <span className="mono">npx swag-money</span> once the package is published. This repo does not publish it for you.</p>
            {query.error === 'api' ? <p className="banner error">Start the API with <span className="mono">pnpm dev</span> and try the demo accounts again.</p> : null}
            {query.error === 'demo' ? <p className="banner error">That demo account is not in the local database.</p> : null}
            {demoAccountsEnabled() ? (
              <div className="cta-row">
                <form action={signIn}>
                  <input type="hidden" name="email" value={DEVELOPER} />
                  <button className="button" type="submit">I&apos;m a developer</button>
                </form>
                <form action={signIn}>
                  <input type="hidden" name="email" value={ADVERTISER} />
                  <button className="button secondary" type="submit">I&apos;m an advertiser</button>
                </form>
              </div>
            ) : (
              <div className="cta-row">
                <Link className="button" href="/signup">Create an account</Link>
                <Link className="button secondary" href="/advertise">Buy a block</Link>
              </div>
            )}
          </div>
          <aside className="receipt" aria-label="Example verified impression">
            <header>
              <span>Impression</span>
              <span>Ed25519</span>
            </header>
            <h2>Northwind CI</h2>
            <p className="line">ephemeral environments for every PR</p>
            <dl>
              <dt>Surface</dt>
              <dd>claude-code spinner</dd>
              <dt>Payload</dt>
              <dd>string only</dd>
              <dt>View</dt>
              <dd>5.0s · 3 read-backs</dd>
              <dt>Clearing price</dt>
              <dd>51¢</dd>
              <dt>Developer</dt>
              <dd className="pay">25¢</dd>
              <dt>Platform</dt>
              <dd>26¢</dd>
              <dt>Remote code</dt>
              <dd>none</dd>
            </dl>
            <footer>
              <span>Odd cent stays with the platform</span>
              <span>{stats ? `${(stats.developerShareBps / 100).toFixed(0)}% share` : '50% share'}</span>
            </footer>
            <div className="perf" aria-hidden="true" />
          </aside>
        </section>

        <section className="wrap band" id="compare">
          <h2>How this differs from Kickbacks.ai</h2>
          <p className="sub">
            As of September 2026, from their public pages and the published extension. The full table is on the comparison page.
            Nothing here is a claim about Swag-Money’s user count.
          </p>
          <div className="compare-board short">
            {COMPARE_ROWS.slice(0, 4).map((row) => (
              <article key={row.id}>
                <h3>{row.topic}</h3>
                <p><strong>Kickbacks.ai today.</strong> {row.shortKickbacks}</p>
                <p><strong>Swag-Money.</strong> {row.shortSwag}</p>
              </article>
            ))}
          </div>
          <p><Link className="button" href="/compare">Full comparison</Link></p>
          <p className="tiny">{COMPARE_NOTE}</p>
        </section>

        <section className="wrap band" id="differentiators">
          <h2>Four constraints the client is built around.</h2>
          <p className="sub">
            The comparison page cites the public sources. These four are the product rules on this side of that table.
          </p>
          <div className="grid-4">
            <article className="card">
              <div className="idx">01 · Zero trust</div>
              <h3>Strings, signed.</h3>
              <p>The client pins an Ed25519 key and renders a payload of strings. Extra fields, non-strings, newlines, and ANSI escapes are rejected before anything is written.</p>
            </article>
            <article className="card">
              <div className="idx">02 · Render challenge</div>
              <h3>Prove the paint.</h3>
              <p>Every impression carries a nonce. The device signs three read-backs spanning five continuous seconds. The server clock has to agree. Replays pay nothing.</p>
            </article>
            <article className="card">
              <div className="idx">03 · Every surface</div>
              <h3>One core, many hosts.</h3>
              <p>One client core. Claude Code CLI is working. Editors, Gemini-family CLIs, and browser wait states are beta. OpenCode, Kilo, Goose, and JetBrains are scaffolds. The directory says which is which.</p>
            </article>
            <article className="card">
              <div className="idx">04 · How you get paid</div>
              <h3>Not only Stripe.</h3>
              <p>Stripe Connect, Solana, Lightning, UPI, or API credits with a 10% bonus. Payouts are on demand once the balance clears $10.</p>
            </article>
          </div>
        </section>

        <section className="wrap band">
          <h2>What the client is not allowed to do.</h2>
          <table>
            <thead>
              <tr>
                <th>Behavior</th>
                <th>Typical wait-state client</th>
                <th>Swag-Money</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Code from the server</td>
                <td>Fetched on a timer and executed</td>
                <td>Never. The response is a signed JSON object of strings.</td>
              </tr>
              <tr>
                <td>Content Security Policy</td>
                <td>Weakened so remote scripts can run</td>
                <td>Untouched. The browser extension keeps <span className="mono">script-src &apos;self&apos;</span>.</td>
              </tr>
              <tr>
                <td>Impression proof</td>
                <td>A client-reported HTTP ping</td>
                <td>Nonce, read-back transcript, device signature, and a 5 second server clock.</td>
              </tr>
              <tr>
                <td>Payout rails</td>
                <td>Stripe Connect countries only</td>
                <td>Stripe, Solana, Lightning, UPI, or API credits at 110%. On demand at $10.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="wrap band" id="auction">
          <h2>An English auction on a few seconds of attention.</h2>
          <p className="sub">
            Inventory is the wait itself, not a rectangle on a page. Campaigns set a max bid. The clearing price is the
            second-highest max plus one cent, and it never exceeds the winner&apos;s max. A lone bidder pays the 2¢ reserve.
          </p>
          <div className="steps">
            <article>
              <strong>Bid</strong>
              <p>Northwind&apos;s max is 80¢. Helio&apos;s max is 50¢. Both target Claude Code and still have budget.</p>
            </article>
            <article>
              <strong>Clear</strong>
              <p>Northwind wins and pays 51¢. The price is reserved immediately so two wait states cannot spend the same budget.</p>
            </article>
            <article>
              <strong>Hold</strong>
              <p>The adapter writes the signed line, reads it back at 0s, 2.5s, and 5s, then the device key signs that transcript.</p>
            </article>
            <article>
              <strong>Split</strong>
              <p>25¢ is ledgered to the developer. 26¢ stays with the platform. The odd cent is not rounded away.</p>
            </article>
          </div>
        </section>

        <section className="wrap band" id="payouts">
          <h2>Your share of the clearing price, on demand past $10.</h2>
          <div className="grid-2">
            <article className="card">
              <div className="idx">Developers</div>
              <h3>Dead time, with a receipt.</h3>
              <ul>
                <li>Install the Claude Code adapter. It backs up <span className="mono">spinnerVerbs</span> and restores the original bytes.</li>
                <li>Verified impressions show up with the price and your half.</li>
                <li>Payouts open at $10, on demand, via Stripe Connect, Solana, Lightning, UPI, or API credits.</li>
              </ul>
            </article>
            <article className="card">
              <div className="idx">Advertisers</div>
              <h3>Engineers, during the pause.</h3>
              <ul>
                <li>One ASCII line. No tracking pixel, no landing-page script on the developer machine.</li>
                <li>You pay the clearing price only after the render challenge verifies.</li>
                <li>Target Claude Code, VS Code-family editors, the browser, or the JetBrains stub.</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="wrap band" id="buy">
          <h2>Buy a block.</h2>
          <p className="sub">
            Same fields as a self-serve impression order: line, destination, brand, icon, invoice, bid, blocks, surface, pace, and country. The total and the forecast update as you type. Checkout is mocked.
          </p>
          <BuyForm signedIn={me.ok} role={me.ok ? me.data.role : undefined} />
        </section>

        <section className="wrap band security" id="security">
          <div>
            <h2>Threat model, including the part we cannot promise.</h2>
            <p className="sub">The fraud check is designed so a replayed HTTP request, with no render, does not earn money. It is not a hardware attestation.</p>
          </div>
          <div>
            <ul>
              <li>Ad responses omit the signing key. The client verifies against a key it already pinned.</li>
              <li>A second verify of the same impression returns a replay and does not credit the ledger again.</li>
              <li>A correctly shaped proof submitted before five seconds of server time is rejected, even if the caller invented the sample timestamps.</li>
              <li>A proof that is not signed by the registered device key is rejected.</li>
              <li>Claude Code writes go through the local adapter, only after verification, and uninstall puts the previous file bytes back.</li>
            </ul>
            <div className="limits">
              <strong>Honest limit.</strong>
              <p>
                The read-back comes from the adapter running on the developer&apos;s machine. Someone who patches the client and
                holds the device private key can sign a transcript for text that was never on screen. Swag-Money does not claim
                a TPM, a screenshot oracle, or a guarantee against a modified open-source client. What it does stop is the easy
                fraud: curl, replays, short views, and unsigned or altered payloads.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

async function loadStats(): Promise<PublicStats | null> {
  try {
    const response = await api('/v1/public/stats')
    if (!response.ok) return null
    const body = (await response.json()) as PublicStats
    if (body.source !== 'ledger' || !Number.isInteger(body.verifiedImpressions)) return null
    return body
  } catch {
    return null
  }
}

function LedgerStrip({ stats }: { stats: PublicStats | null }) {
  if (!stats) {
    return (
      <div className="ledger-strip" aria-label="Ledger status">
        <article>
          <b>Offline</b>
          <span>Ledger unreachable. No number is shown in its place.</span>
        </article>
      </div>
    )
  }
  return (
    <div className="ledger-strip" aria-label="Live ledger totals">
      <article>
        <b>{stats.verifiedImpressions.toLocaleString('en-US')}</b>
        <span>Verified impressions</span>
      </article>
      <article>
        <b>{formatUsd(stats.developerEarningsCents)}</b>
        <span>Developer earnings</span>
      </article>
      <article>
        <b>{formatUsd(stats.paidOutCents)}</b>
        <span>Paid out</span>
      </article>
      <article>
        <b>{stats.developerCount.toLocaleString('en-US')}</b>
        <span>Developers on this ledger</span>
      </article>
    </div>
  )
}
