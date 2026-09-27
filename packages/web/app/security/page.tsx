import { SiteFooter, SiteNav } from '../../components/nav'

export default function SecurityPage() {
  return (
    <>
      <SiteNav />
      <main id="content" className="wrap page-pad prose">
        <p className="kicker">Security</p>
        <h1>Disclosure</h1>
        <p>
          If you find a bug in this demo, open an issue on the repository. Give us a chance to fix it before you publish exploit detail.
          Do not access other people’s data, and do not try to spend a live payment credential. This build refuses live Stripe and live Razorpay keys.
        </p>
        <p>
          The client pins an Ed25519 key and rejects anything that is not the signed string. It does not fetch executable updates.
          A modified open-source client can still lie about a render. That limit is described on the homepage.
        </p>
      </main>
      <SiteFooter />
    </>
  )
}
