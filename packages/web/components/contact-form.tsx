'use client'

import { useActionState } from 'react'
import { submitContact, type FormState } from '../app/actions'

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, null as FormState)
  const errors = state?.errors ?? {}
  return (
    <form className="panel" action={action}>
      <label htmlFor="name">Name</label>
      <input id="name" name="name" required maxLength={120} aria-invalid={errors.name ? true : undefined} />
      <FieldError message={errors.name} />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required aria-invalid={errors.email ? true : undefined} />
      <FieldError message={errors.email} />
      <label htmlFor="topic">Topic</label>
      <select id="topic" name="topic" defaultValue="developer" aria-invalid={errors.topic ? true : undefined}>
        <option value="advertiser">Advertiser</option>
        <option value="developer">Developer or payouts</option>
        <option value="privacy">Privacy</option>
        <option value="press">Press</option>
        <option value="security">Security</option>
      </select>
      <FieldError message={errors.topic} />
      <label htmlFor="message">Message</label>
      <textarea id="message" name="message" required maxLength={4000} aria-invalid={errors.message ? true : undefined} />
      <FieldError message={errors.message} />
      <div className="hp">
        <label htmlFor="companyWebsite">Company website</label>
        <input id="companyWebsite" name="companyWebsite" tabIndex={-1} autoComplete="off" />
      </div>
      <FieldError message={errors.form} />
      <button className="button" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Send'}</button>
    </form>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="field-error">{message}</p>
}
