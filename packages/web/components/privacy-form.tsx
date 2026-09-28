'use client'

import { useActionState, useState } from 'react'
import { submitPrivacy, type FormState } from '../app/actions'

const KINDS = [
  ['access', 'Access', 'Get a copy of the personal data we hold about you.'],
  ['correct', 'Correct', 'Fix personal data that is wrong.'],
  ['delete', 'Delete', 'Delete the account and the personal data attached to it.'],
  ['do-not-sell', 'Do not sell or share', 'Record an opt-out. We do not sell or share personal data. The choice is stored anyway.'],
  ['appeal', 'Appeal', 'Appeal a decision on an earlier request.'],
  ['other', 'Other', 'Another privacy request.'],
] as const

export function PrivacyForm({ signedIn, email }: { signedIn: boolean; email?: string }) {
  const [state, action, pending] = useActionState(submitPrivacy, null as FormState)
  const [cant, setCant] = useState(!signedIn)
  const errors = state?.errors ?? {}
  return (
    <form className="panel" action={action}>
      <fieldset>
        <legend>What should we do?</legend>
        {KINDS.map(([value, label, hint]) => (
          <label key={value} className="check-row">
            <input type="radio" name="kind" value={value} defaultChecked={value === 'access'} />
            <span><strong>{label}.</strong> {hint}</span>
          </label>
        ))}
        <FieldError message={errors.kind} />
      </fieldset>
      <p className="tiny">
        Product questions that are not a privacy request go to <a href="mailto:support@swagmoney.ai">support@swagmoney.ai</a>.
      </p>
      {signedIn && !cant ? (
        <>
          <input type="hidden" name="path" value="session" />
          <p>Signed in as {email}. This request is tied to that account.</p>
          <input type="hidden" name="email" value={email ?? ''} />
          <button className="text-button" type="button" onClick={() => setCant(true)}>Use a different email instead</button>
        </>
      ) : (
        <>
          <label className="check-row">
            <input type="checkbox" name="cantLogin" value="yes" checked={cant} onChange={(event) => setCant(event.target.checked)} />
            I cannot log in, or I do not have an account. Verify this request by email before acting on it.
          </label>
          {!signedIn ? <p className="tiny"><a href="/login?next=/privacy-choices">Sign in</a> if you want the request checked against the account immediately. Signing in from here does not create an account by itself.</p> : null}
          <label htmlFor="privacy-email">Email on the account</label>
          <input id="privacy-email" name="email" type="email" required defaultValue={email ?? ''} aria-invalid={errors.email ? true : undefined} />
          <FieldError message={errors.email} />
        </>
      )}
      <label htmlFor="region">State or country (optional)</label>
      <input id="region" name="region" maxLength={80} placeholder="Helps us apply the right law" />
      <FieldError message={errors.region} />
      <label htmlFor="details">Anything else (optional)</label>
      <textarea id="details" name="details" maxLength={2000} />
      <FieldError message={errors.details} />
      <label className="check-row">
        <input type="checkbox" name="authorizedAgent" value="yes" />
        I am an authorized agent sending this for someone else. We may ask for their written permission.
      </label>
      <div className="hp">
        <label htmlFor="companyWebsite">Company website</label>
        <input id="companyWebsite" name="companyWebsite" tabIndex={-1} autoComplete="off" />
      </div>
      <FieldError message={errors.path || errors.form} />
      <button className="button" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Submit request'}</button>
    </form>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="field-error">{message}</p>
}
