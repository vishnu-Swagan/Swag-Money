import { SiteFooter, SiteNav } from '../../components/nav'

export default function TermsPage() {
  return (
    <>
      <SiteNav />
      <main id="content" className="wrap page-pad prose">
        <p className="kicker">Terms</p>
        <h1>Terms of use</h1>
        <p>These terms cover the Swag-Money demo in this repository. They are plain on purpose.</p>
        <h2>The product</h2>
        <p>Swag-Money serves one signed line of advertising into a wait state. The developer who renders it can earn a share of the clearing price. The default share is 50%, stored as SWAG_DEVELOPER_SHARE_BPS. Changing that number changes the split. It does not require a new contract buried in a PDF.</p>
        <h2>What we do not take</h2>
        <p>We do not read or transmit your prompts, model replies, source code, file names, or repository names. There is no opt-in “boosted” mode that trades conversation text for a higher rate. If a future feature needed that, it would be a different product, and it is not this one.</p>
        <h2>Ads</h2>
        <p>An ad is a single printable ASCII line. The destination URL stays on the server. Campaigns can target a placement, a tool, and up to 20 countries. You pay the auction clearing price after a verified render, up to your max bid and your prepaid budget.</p>
        <h2>Money</h2>
        <p>Payouts are available on demand at $10 of verified earnings. Rails include Stripe Connect, Solana, Lightning, UPI, and API credits. This public build records mock or sandbox receipts and refuses live Stripe and live Razorpay secrets. Do not put production keys in the repo.</p>
        <h2>Accounts</h2>
        <p>You need to be 18 or older. One person, one account. Do not replay proofs, share device keys, or run a farm of installs. We can reject an impression or reverse a credit when the proof fails.</p>
        <h2>Acceptable ads</h2>
        <p>No malware, no impersonation, no adult content, no gambling. We can pause a campaign. In this demo, a mock charge is not a refundable card payment because no card was charged.</p>
      </main>
      <SiteFooter />
    </>
  )
}
