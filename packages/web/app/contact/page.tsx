import { ContactForm } from '../../components/contact-form'
import { SiteFooter, SiteNav } from '../../components/nav'
import { apiJson } from '../../lib/api'

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  const query = await searchParams
  const me = await apiJson<{ role: string }>('/v1/me')
  return (
    <>
      <SiteNav signedIn={me.ok} />
      <main id="content" className="wrap page-pad">
        <p className="kicker">Contact</p>
        <h1>Write to us.</h1>
        <p className="dek">These addresses are the ones a production mailbox would use. This form stores the message locally and does not send mail.</p>
        <ul className="address-list">
          <li><a href="mailto:support@swagmoney.ai">support@swagmoney.ai</a> for product help</li>
          <li><a href="mailto:privacy@swagmoney.ai">privacy@swagmoney.ai</a> for privacy requests</li>
          <li><a href="mailto:security@swagmoney.ai">security@swagmoney.ai</a> for vulnerabilities</li>
          <li><a href="mailto:legal@swagmoney.ai">legal@swagmoney.ai</a> for legal and comparison corrections</li>
        </ul>
        {query.notice === 'received' ? <p className="banner ok">Stored. No mail was sent.</p> : null}
        <ContactForm />
      </main>
      <SiteFooter />
    </>
  )
}
