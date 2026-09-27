'use client'

import { COUNTRIES } from '@swag-money/shared'
import { useActionState, useMemo, useState } from 'react'
import { completeSetup, type FormState } from '../app/actions'

export function SetupForm({ email, next }: { email: string; next?: string }) {
  const [state, action, pending] = useActionState(completeSetup, null as FormState)
  const [query, setQuery] = useState('')
  const [country, setCountry] = useState('')
  const matches = useMemo(
    () =>
      COUNTRIES.filter((item) => `${item.name} ${item.code}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8),
    [query],
  )
  const errors = state?.errors ?? {}
  return (
    <form className="panel" action={action}>
      <h2>You are signed in. Confirm your country to continue.</h2>
      <p className="tiny">Signed in as {email}.</p>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label htmlFor="country-search">Country of residence</label>
      <input id="country-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search countries" />
      <input type="hidden" name="country" value={country} />
      <div className="picker-list">
        {matches.map((item) => (
          <button key={item.code} type="button" className={item.code === country ? 'selected' : undefined} onClick={() => setCountry(item.code)}>
            {item.name}
          </button>
        ))}
      </div>
      <p className="tiny">
        Selected: {country || 'none'}. <a href="/faq#payouts">See supported payout rails</a>. UPI works for India.
      </p>
      <FieldError message={errors.country} />
      <fieldset>
        <legend>Payout method</legend>
        <label className="check-row"><input type="radio" name="payoutPreference" value="upi" /> UPI (RazorpayX). This is the rail that works for India.</label>
        <label className="check-row"><input type="radio" name="payoutPreference" value="stripe" /> Stripe</label>
        <label className="check-row"><input type="radio" name="payoutPreference" value="crypto" /> Crypto (Solana or Lightning)</label>
        <label className="check-row"><input type="radio" name="payoutPreference" value="api_credits" /> API credits, with a 10% bonus</label>
        <FieldError message={errors.payoutPreference} />
      </fieldset>
      <label className="check-row">
        <input type="checkbox" name="newsOptIn" value="yes" />
        Send me news and offers. You can turn this off later.
      </label>
      <p className="tiny">Email about earning with Swag-Money. Off unless you check this.</p>
      <FieldError message={errors.form} />
      <button className="button" type="submit" disabled={pending}>Complete setup</button>
    </form>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="field-error">{message}</p>
}
