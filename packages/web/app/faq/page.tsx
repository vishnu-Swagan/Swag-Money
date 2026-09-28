import { SiteFooter, SiteNav } from '../../components/nav'

const GROUPS: Array<{ title: string; items: Array<{ q: string; a: string }> }> = [
  {
    title: 'Setup',
    items: [
      {
        q: 'How do I install it?',
        a: 'From this repo, run pnpm swag-money. It prints which supported tools it can see. pnpm swag-money apply writes their official config. The published form of that command is npx swag-money.',
      },
      {
        q: 'Which tools actually earn?',
        a: 'Claude Code CLI is the working path: a signed line, a five-second read-back, and a ledger credit. Other tools are beta or scaffold. The integrations directory is the list, and it does not upgrade a status to make the page look fuller.',
      },
      {
        q: 'Do you patch Claude Code or Cursor?',
        a: 'No. Claude Code is configured through spinnerVerbs, spinnerTipsOverride, and statusLine. Cursor gets a hooks file plus our own status-bar item. We do not edit workbench.html or another extension’s bundle.',
      },
    ],
  },
  {
    title: 'Earnings',
    items: [
      {
        q: 'What counts as an impression?',
        a: 'The device shows the signed string, reads it back three times across at least five seconds, and signs that transcript. The server clock has to agree. A short view, a replay, or an unsigned request pays nothing.',
      },
      {
        q: 'What share do I get?',
        a: 'The default is 50% of the clearing price, set by SWAG_DEVELOPER_SHARE_BPS (5000). The platform keeps the remainder, including an odd cent. Raising the share is a config change, not a rewrite.',
      },
      {
        q: 'When do I get paid?',
        a: 'On demand, once the verified balance is at least $10. There is no two-week batch. Rails are Stripe Connect, Solana, Lightning, UPI, and API credits with a 10% bonus. In this public build every rail is mock or sandbox.',
      },
      {
        q: 'I am in India. Can I withdraw?',
        a: 'Yes. Choose UPI and a VPA such as name@okaxis. The provider behind that option is RazorpayX, mocked unless you set test keys. A live Razorpay key is refused.',
      },
    ],
  },
  {
    title: 'Privacy',
    items: [
      {
        q: 'Do you read prompts or code?',
        a: 'No. There is no mode that uploads prompts, replies, repo names, or file contents. Hook scripts do not read stdin when the host would put the prompt there. Compare that with products that offer an opt-in “boosted” mode which sends conversation context to an ad network. We do not have that mode.',
      },
      {
        q: 'What does leave the machine?',
        a: 'A signed ad request (install id, surface, nonce, time), and later a signed render transcript of the ad text itself. The destination URL of a campaign stays on the server. It is not inside the signed payload.',
      },
      {
        q: 'How does country targeting work without tracking me?',
        a: 'The client may send a country code you configured locally. We do not look up your IP to build a profile. A campaign that lists countries only fills when that code matches.',
      },
    ],
  },
  {
    title: 'Advertisers',
    items: [
      {
        q: 'How do I buy impressions?',
        a: 'A block is 1,000 impression credits. The minimum bid is $0.50 per block. Checkout in this build is a mock card charge. You then bid in the live English auction until the budget or the credits run out.',
      },
      {
        q: 'Can I target a surface or a country?',
        a: 'Yes. Terminal, editor, and browser are separate, and so is each tool. Country lists hold up to 20 codes and add $0.75 per block to the invoice, not to the auction budget.',
      },
      {
        q: 'Is there an API?',
        a: 'Yes. Create a key in the advertiser API. It looks like sm_test_… and is shown once. See the API page for the routes.',
      },
    ],
  },
]

export default function FaqPage() {
  return (
    <>
      <SiteNav current="faq" />
      <main id="content" className="wrap page-pad">
        <p className="kicker">FAQ</p>
        <h1>Questions</h1>
        {GROUPS.map((group) => (
          <section key={group.title} className="band">
            <h2 id={group.title === 'Earnings' ? 'payouts' : undefined}>{group.title}</h2>
            {group.items.map((item) => (
              <details key={item.q} className="faq">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  )
}
