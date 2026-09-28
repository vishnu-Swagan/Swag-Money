import Link from 'next/link'
import { DemoSwitch, SiteFooter, SiteNav } from '../../components/nav'
import { LoginPanel } from '../../components/login-panel'
import { SetupForm } from '../../components/setup-form'
import { apiJson } from '../../lib/api'
import { keepDeletion, reactivateAccount, signOut } from '../actions'

type Profile = {
  email: string
  name: string
  role: string
  setupComplete: boolean
  deletionScheduledAtMs: number | null
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; notice?: string }>
}) {
  const query = await searchParams
  const me = await apiJson<Profile>('/v1/me')
  const next = query.next && query.next.startsWith('/') && !query.next.startsWith('//') ? query.next : undefined
  return (
    <>
      <SiteNav current="login" signedIn={me.ok} />
      <main id="content" className="wrap login-grid">
        <div>
          <h1>Sign in to earn.</h1>
          <p className="dek">New here? Create your account. Already earning? Sign in to see your balance.</p>
          <p>Use the same email you install with. Need the command? <Link href="/install">Get started</Link>.</p>
        </div>
        {me.ok && me.data.deletionScheduledAtMs ? (
          <section className="panel">
            <h2>This account is scheduled for deletion</h2>
            <p>
              Erasure can begin after {new Date(me.data.deletionScheduledAtMs).toUTCString()}. Until then the account stays locked and earns nothing.
            </p>
            <p>Reactivate it below if you want to keep it. Otherwise keep the deletion scheduled. You will be signed out and the deletion stays on the calendar.</p>
            <div className="inline">
              <form action={reactivateAccount}><button className="button" type="submit">Reactivate my account</button></form>
              <form action={keepDeletion}><button className="button secondary" type="submit">Keep deletion scheduled</button></form>
            </div>
          </section>
        ) : me.ok && !me.data.setupComplete && me.data.role === 'developer' ? (
          <SetupForm email={me.data.email} next={next} />
        ) : me.ok ? (
          <section className="panel">
            <h2>You are signed in as {me.data.email}.</h2>
            {query.error === 'retry' ? <p className="banner error">Try again to finish, or use a different account.</p> : null}
            <p><Link href={me.data.role === 'advertiser' ? '/advertisers' : '/developers'}>Account dashboard</Link></p>
            <div className="inline">
              <form action={signOut}><button className="button secondary" type="submit">Use a different account</button></form>
              <Link href="/login?error=retry">Try again</Link>
            </div>
          </section>
        ) : (
          <LoginPanel next={next} error={query.error} />
        )}
        {query.notice === 'deletion' ? <p className="banner">Deletion stays scheduled. You are signed out.</p> : null}
        <section>
          <h2>Local demo</h2>
          <p className="tiny">Fixture accounts on this machine. They skip the age checkbox because they are already seeded.</p>
          <DemoSwitch />
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
