import { formatUsd, SURFACES } from '@swag-money/shared'
import Link from 'next/link'
import { DemoSwitch, SiteNav } from '../../components/nav'
import { apiJson } from '../../lib/api'
import { createCampaign, updateCampaign } from '../actions'

export const dynamic = 'force-dynamic'

type Preview = {
  surface: string
  winner: null | {
    name: string
    priceCents: number
    developerShareCents: number
    platformShareCents: number
    secondMaxBidCents: number | null
  }
}

type Campaign = {
  id: string
  name: string
  advertiserName: string
  status: string
  text: string
  maxBidCents: number
  budgetCents: number
  spentCents: number
  reservedCents: number
  remainingCents: number
  surfaces: string[]
  verifiedImpressions: number
  pendingImpressions: number
}

export default async function AdvertisersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const query = await searchParams
  const me = await apiJson<{ role: string }>('/v1/me')
  if (!me.ok) {
    return (
      <>
        <SiteNav current="advertisers" />
        <main id="content" className="wrap gate">
          <p className="kicker">Advertisers</p>
          <h1>Bid on the pause, not a banner.</h1>
          <p className="dek">{me.error}</p>
          <DemoSwitch />
        </main>
      </>
    )
  }
  if (me.data.role !== 'advertiser') {
    return (
      <>
        <SiteNav current="advertisers" signedIn />
        <main id="content" className="wrap gate">
          <h1>This demo user earns the impressions.</h1>
          <p className="dek">Switch to Lin to create a campaign and set a max bid.</p>
          <DemoSwitch />
        </main>
      </>
    )
  }

  const body = await apiJson<{ campaigns: Campaign[]; previews: Preview[] }>('/v1/advertiser/campaigns')
  if (!body.ok) {
    return (
      <>
        <SiteNav current="advertisers" signedIn />
        <main id="content" className="wrap gate"><p>{body.error}</p></main>
      </>
    )
  }

  const claude = body.data.previews.find((preview) => preview.surface === 'claude-code')

  return (
    <>
      <SiteNav current="advertisers" signedIn />
      <main id="content" className="wrap">
        <div className="dash-top">
          <div>
            <p className="kicker">Advertiser desk</p>
            <h1>English auction</h1>
            <p className="who">You set a max bid. You pay the second price plus one cent, and only after a verified render. <Link href="/advertise">Buy impression blocks</Link> when you want placement and country targeting.</p>
          </div>
          <DemoSwitch />
        </div>
        {query.error ? <p className="banner error">{query.error}</p> : null}
        {query.notice === 'campaign' ? <p className="banner ok">Campaign is live and can win the next wait state.</p> : null}
        {query.notice === 'bid' ? <p className="banner ok">Bid updated. The next impression uses the new max.</p> : null}
        {query.notice === 'checkout' ? <p className="banner ok">Mock checkout recorded. The block budget is in the auction. No card network was contacted.</p> : null}
        <section className="panel">
          <h2>Clearing right now</h2>
          <div className="stats">
            {body.data.previews.map((preview) => (
              <article className="stat" key={preview.surface}>
                <b>{preview.winner ? formatUsd(preview.winner.priceCents) : '—'}</b>
                <span>
                  {preview.surface}
                  {preview.winner ? ` · ${preview.winner.name}` : ' · no eligible bid'}
                </span>
              </article>
            ))}
          </div>
          {claude?.winner ? (
            <p className="tiny">
              On Claude Code, {claude.winner.name} clears at {formatUsd(claude.winner.priceCents)}
              {claude.winner.secondMaxBidCents !== null ? ` against a ${formatUsd(claude.winner.secondMaxBidCents)} second bid` : ' with no competing bid'}.
              Developer {formatUsd(claude.winner.developerShareCents)}, platform {formatUsd(claude.winner.platformShareCents)}.
            </p>
          ) : null}
        </section>
        <section className="split">
          <div className="panel">
            <h2>Campaigns</h2>
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Max bid</th>
                  <th>Spent</th>
                  <th>Left</th>
                  <th>Verified</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {body.data.campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <strong>{campaign.name}</strong>
                      <div className="tiny">{campaign.text}</div>
                      <div className="tiny">{campaign.surfaces.join(' · ')} · <span className={`badge ${campaign.status}`}>{campaign.status}</span></div>
                    </td>
                    <td className="num">{formatUsd(campaign.maxBidCents)}</td>
                    <td className="num">{formatUsd(campaign.spentCents)}{campaign.reservedCents ? <div className="tiny">{formatUsd(campaign.reservedCents)} reserved</div> : null}</td>
                    <td className="num">{formatUsd(campaign.remainingCents)}</td>
                    <td className="num">{campaign.verifiedImpressions}{campaign.pendingImpressions ? <div className="tiny">{campaign.pendingImpressions} pending</div> : null}</td>
                    <td>
                      <form action={updateCampaign}>
                        <input type="hidden" name="id" value={campaign.id} />
                        <div className="inline">
                          <input name="maxBid" aria-label={`New max bid for ${campaign.name}`} placeholder="0.80" />
                          <button className="button secondary" type="submit">Bid</button>
                        </div>
                      </form>
                      <form action={updateCampaign}>
                        <input type="hidden" name="id" value={campaign.id} />
                        <input type="hidden" name="status" value={campaign.status === 'active' ? 'paused' : 'active'} />
                        <button className="button secondary" type="submit">{campaign.status === 'active' ? 'Pause' : 'Resume'}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="panel" action={createCampaign}>
            <h2>New campaign</h2>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" required maxLength={60} />
            <label htmlFor="advertiserName">Brand on the signed line</label>
            <input id="advertiserName" name="advertiserName" required maxLength={40} />
            <label htmlFor="text">One ASCII line, 80 characters max</label>
            <textarea id="text" name="text" required maxLength={80} />
            <label htmlFor="maxBid">Max bid (USD)</label>
            <input id="maxBid" name="maxBid" required defaultValue="0.60" />
            <label htmlFor="budget">Budget (USD)</label>
            <input id="budget" name="budget" required defaultValue="25.00" />
            <label>Surfaces</label>
            <div className="checks">
              {SURFACES.map((surface) => (
                <label key={surface}>
                  <input type="checkbox" name="surfaces" value={surface} defaultChecked={surface === 'claude-code' || surface === 'vscode' || surface === 'browser'} />
                  {surface}
                </label>
              ))}
            </div>
            <button className="button" type="submit">Create campaign</button>
          </form>
        </section>
      </main>
    </>
  )
}
