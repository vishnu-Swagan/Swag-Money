'use client'

import { useActionState, useState } from 'react'
import { consumeMagicLink, googleSignIn, loginAccount, requestMagicLink, type MagicState } from '../app/actions'

export function LoginPanel({ next, error }: { next?: string; error?: string }) {
  const [adult, setAdult] = useState(false)
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(requestMagicLink, null as MagicState)
  const banner =
    error === 'retry'
      ? 'That sign-in did not finish. Try again, or use a different account.'
      : error === 'adult'
        ? 'Confirm that you are 18 or older and agree to the terms.'
        : error === 'google'
          ? 'Google sign-in is not connected in this build. Use an email link.'
          : ''

  return (
    <div className="panel">
      <h2>Sign up / Log in</h2>
      {banner ? <p className="banner error">{banner}</p> : null}
      {state?.error ? <p className="banner error">{state.error}</p> : null}
      <label className="check-row">
        <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} />
        <span>
          I am 18 or older and I agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.
        </span>
      </label>
      <form action={googleSignIn}>
        <input type="hidden" name="adult" value={adult ? 'yes' : 'no'} />
        <button className="button secondary wide" type="submit" disabled={!adult}>Continue with Google</button>
      </form>
      <p className="tiny">Google is shown because earners expect it. This build has no Google client, so the button explains that and stops.</p>
      <button className="text-button" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide other sign-in options' : 'Other sign-in options'}
      </button>
      {open ? (
        <form action={loginAccount}>
          <input type="hidden" name="adult" value={adult ? 'yes' : 'no'} />
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <label htmlFor="password-email">Email</label>
          <input id="password-email" name="email" type="email" required autoComplete="username" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
          <button className="button secondary" type="submit" disabled={!adult}>Sign in with password</button>
        </form>
      ) : null}
      <form action={action}>
        <input type="hidden" name="adult" value={adult ? 'yes' : 'no'} />
        <label htmlFor="magic-email">Email</label>
        <input id="magic-email" name="email" type="email" required autoComplete="email" defaultValue={state?.email ?? ''} />
        <button className="button" type="submit" disabled={!adult || pending}>
          {pending ? 'Preparing the link…' : 'Email me a sign-in link'}
        </button>
      </form>
      {state?.sent ? (
        <div className="banner ok">
          <p>No mail leaves this build. {state.devToken ? 'Use the local link to finish on this machine.' : 'A mailer is not configured, so the link was stored and not shown.'}</p>
          {state.devToken ? (
            <form action={consumeMagicLink}>
              <input type="hidden" name="token" value={state.devToken} />
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <button className="button" type="submit">Continue on this machine</button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
