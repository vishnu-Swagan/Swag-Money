import Link from 'next/link'
import { PrivacyForm } from '../../components/privacy-form'
import { SiteFooter, SiteNav } from '../../components/nav'
import { apiJson } from '../../lib/api'

export default async function PrivacyChoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  const query = await searchParams
  const me = await apiJson<{ email: string }>('/v1/me')
  return (
    <>
      <SiteNav signedIn={me.ok} />
      <main id="content" className="wrap page-pad prose">
        <p className="kicker">Your Privacy Choices</p>
        <h1>Your privacy choices</h1>
        <p>
          Ask for access, a correction, deletion, an appeal, or an opt-out of sale or sharing. You do not need an account.
          We will not treat you worse for asking. You can also email <a href="mailto:privacy@swagmoney.ai">privacy@swagmoney.ai</a>.
        </p>
        <p>
          Swag-Money does not sell or share personal data, and it has no mode that uploads prompts or code.
          The “do not sell or share” choice is still here so the request can be recorded.
        </p>
        {query.notice === 'received' ? (
          <p className="banner ok">The request is stored. If you could not sign in, email verification stays pending. This build does not send mail.</p>
        ) : null}
        <PrivacyForm signedIn={me.ok} email={me.ok ? me.data.email : undefined} />
        <h2>How we handle your request</h2>
        <p>
          The request is stored with the time it arrived. We match it to the account email when you are signed in, or we hold it until the email is confirmed.
          This demo does not send that confirmation. If a request is denied, appeal here or email privacy@swagmoney.ai with “Appeal” in the subject.
        </p>
        <p><Link href="/privacy">Privacy policy</Link></p>
      </main>
      <SiteFooter />
    </>
  )
}
