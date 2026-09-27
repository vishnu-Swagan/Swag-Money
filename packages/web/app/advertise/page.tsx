import Link from 'next/link'
import { BuyForm } from '../../components/buy-form'
import { SiteFooter, SiteNav } from '../../components/nav'
import { apiJson } from '../../lib/api'

export const dynamic = 'force-dynamic'

export default async function AdvertisePage() {
  const me = await apiJson<{ role: string; name: string }>('/v1/me')
  return (
    <>
      <SiteNav current="advertise" signedIn={me.ok} />
      <main id="content" className="wrap page-pad">
        <p className="kicker">Advertisers</p>
        <h1>Buy a block of impressions.</h1>
        <p className="dek">
          A block is 1,000 impressions. The minimum bid is $0.50, and the form starts at $2.00. Checkout is a mock card charge. You never pay more than the total shown, and extra delivery is free. The signed line is still checked by the English auction after the block is bought.
        </p>
        <p className="tiny"><Link href="/surface-pricing">How placement pricing works.</Link></p>
        <BuyForm signedIn={me.ok} role={me.ok ? me.data.role : undefined} />
      </main>
      <SiteFooter />
    </>
  )
}
