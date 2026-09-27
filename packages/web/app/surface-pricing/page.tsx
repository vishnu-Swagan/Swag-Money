import { SiteFooter, SiteNav } from '../../components/nav'
import Link from 'next/link'

export default function SurfacePricingPage() {
  return (
    <>
      <SiteNav />
      <main id="content" className="wrap page-pad prose">
        <p className="kicker">Pricing</p>
        <h1>Three placements, one auction rule.</h1>
        <p>A campaign belongs to terminal, editor, browser, or any. It only competes with campaigns that can serve the same tool. A terminal buy does not set the price of an editor impression.</p>
        <table>
          <thead>
            <tr>
              <th>Placement</th>
              <th>Where it renders</th>
              <th>How it is priced</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Terminal</td>
              <td>Spinner tips, status lines, and CLI hooks</td>
              <td>English auction among terminal campaigns for that tool</td>
            </tr>
            <tr>
              <td>Editor</td>
              <td>Status-bar item, editor hooks</td>
              <td>Separate from the terminal book</td>
            </tr>
            <tr>
              <td>Browser</td>
              <td>A text node beside a site’s generating state</td>
              <td>Separate again, per site</td>
            </tr>
          </tbody>
        </table>
        <h2>Blocks</h2>
        <p>You prepay blocks of 1,000 impression credits. The minimum is $0.50 a block. The live auction still clears per impression, at the second-highest max plus one cent, with a 2¢ reserve. Country targeting adds $0.75 per block to the invoice and does not raise your auction bid.</p>
        <p>The developer share defaults to 50% of that clearing price. It is one server setting.</p>
        <p><Link href="/advertise">Buy a block</Link></p>
      </main>
      <SiteFooter />
    </>
  )
}
