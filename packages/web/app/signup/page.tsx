import Link from 'next/link'
import { SiteFooter, SiteNav } from '../../components/nav'
import { signupAccount } from '../actions'

export default async function SignupPage({
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
        <h1>Sign up</h1>
        <p className="dek">Developers earn. Advertisers buy blocks. Passwords are hashed with scrypt and are not the session token.</p>
        {query.error ? <p className="banner error">{query.error}</p> : null}
        <form className="panel" action={signupAccount}>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required maxLength={60} />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={8} />
          <label htmlFor="role">I am here to</label>
          <select id="role" name="role" defaultValue="developer">
            <option value="developer">Earn from wait states</option>
            <option value="advertiser">Buy impressions</option>
          </select>
          <button className="button" type="submit">Create account</button>
        </form>
        <p>Already registered? <Link href="/login">Log in</Link></p>
      </main>
      <SiteFooter />
    </>
  )
}
