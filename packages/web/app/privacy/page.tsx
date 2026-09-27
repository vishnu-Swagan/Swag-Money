import { SiteFooter, SiteNav } from '../../components/nav'

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <main id="content" className="wrap page-pad prose">
        <p className="kicker">Privacy</p>
        <h1>We do not read your prompts.</h1>
        <p>
          Swag-Money’s client asks for a signed string and later submits proof that the string stayed on screen.
          The proof contains the ad text, timestamps, and a device signature. It does not contain your prompt, the model’s reply, your files, or your repository name.
        </p>
        <div className="compare">
          <article className="card">
            <h2>Swag-Money</h2>
            <ul>
              <li>No prompt upload.</li>
              <li>No “boosted” mode.</li>
              <li>Hook scripts do not consume stdin when the host would place the prompt there.</li>
              <li>Country targeting uses a code the install sends, not an IP profile.</li>
              <li>Destination URLs stay on the server.</li>
            </ul>
          </article>
          <article className="card">
            <h2>The alternative some networks offer</h2>
            <p>
              An opt-in mode, sometimes called Boosted Mode, pays more if you share recent prompts, replies, and repo context with the ad network and its partners.
              That is a sale of conversation content. We do not offer it, including in the EEA, the UK, Switzerland, or anywhere else.
            </p>
          </article>
        </div>
        <h2>What the server stores</h2>
        <ul>
          <li>Account email, name, role, and a scrypt password hash.</li>
          <li>Install ids and device public keys.</li>
          <li>Campaigns, including the destination URL you typed.</li>
          <li>Impressions, prices, and ledger rows.</li>
          <li>API key hashes. The secret itself is not stored.</li>
        </ul>
        <h2>This demo</h2>
        <p>The database is embedded Postgres on the machine running the API. There is no third-party ad exchange in the request path. Payout providers are not called.</p>
      </main>
      <SiteFooter />
    </>
  )
}
