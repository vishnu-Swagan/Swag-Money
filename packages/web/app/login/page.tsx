import Link from 'next/link'
import { DemoSwitch, SiteFooter, SiteNav } from '../../components/nav'
import { loginAccount } from '../actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const query = await searchParams
  return (
    <>
      <SiteNav current="login" />
      <main id="content" className="wrap gate">
        <p className="kicker">Account</p>
        <h1>Log in</h1>
        <p className="dek">Email and password. Demo accounts also accept the local fixture password <span className="mono">swag-demo</span>.</p>
        {query.error ? <p className="banner error">Email or password is wrong.</p> : null}
        <form className="panel" action={loginAccount}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
          <button className="button" type="submit">Log in</button>
        </form>
        <p>No account yet? <Link href="/signup">Sign up</Link></p>
        <h2>Local demo</h2>
        <DemoSwitch />
      </main>
      <SiteFooter />
    </>
  )
}
