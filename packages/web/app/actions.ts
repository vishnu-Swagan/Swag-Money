'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { validateBuyPayload, validateContact, validatePrivacyRequest, validateSetup } from '@swag-money/shared'
import { api } from '../lib/api'

async function token(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get('swag_session')?.value
}

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const next = String(formData.get('next') ?? '')
  let response: Response
  try {
    response = await api(`/v1/demo/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
      cache: 'no-store',
    })
  } catch {
    redirect('/?error=api')
  }
  if (!response.ok) redirect('/?error=demo')
  const body = (await response.json()) as { token: string; user: { role: string } }
  const jar = await cookies()
  jar.set('swag_session', body.token, { httpOnly: true, sameSite: 'lax', path: '/' })
  if (next === 'advertisers' || next === 'developers') redirect(`/${next}`)
  redirect(body.user.role === 'advertiser' ? '/advertisers' : '/developers')
}

export async function signOut() {
  const jar = await cookies()
  jar.delete('swag_session')
  redirect('/')
}

export async function createCampaign(formData: FormData) {
  const surfaces = formData.getAll('surfaces').map(String)
  let response: Response
  try {
    response = await api(`/v1/campaigns`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await token()}`,
      },
      body: JSON.stringify({
        name: String(formData.get('name') ?? ''),
        advertiserName: String(formData.get('advertiserName') ?? ''),
        text: String(formData.get('text') ?? ''),
        maxBidCents: dollarsToCents(String(formData.get('maxBid') ?? '')),
        budgetCents: dollarsToCents(String(formData.get('budget') ?? '')),
        surfaces,
      }),
      cache: 'no-store',
    })
  } catch (error) {
    redirect(`/advertisers?error=${encodeURIComponent(error instanceof Error ? error.message : 'API unavailable')}`)
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    redirect(`/advertisers?error=${encodeURIComponent(body?.error ?? 'Could not create the campaign')}`)
  }
  redirect('/advertisers?notice=campaign')
}

export async function updateCampaign(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const patch: Record<string, string | number> = {}
  const status = String(formData.get('status') ?? '')
  if (status === 'active' || status === 'paused') patch.status = status
  const maxBid = String(formData.get('maxBid') ?? '')
  try {
    if (maxBid) patch.maxBidCents = dollarsToCents(maxBid)
  } catch (error) {
    redirect(`/advertisers?error=${encodeURIComponent(error instanceof Error ? error.message : 'Invalid bid')}`)
  }
  const response = await api(`/v1/campaigns/${id}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${await token()}`,
    },
    body: JSON.stringify(patch),
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    redirect(`/advertisers?error=${encodeURIComponent(body?.error ?? 'Could not update the campaign')}`)
  }
  redirect('/advertisers?notice=bid')
}

export async function requestPayout(formData: FormData) {
  const provider = String(formData.get('provider') ?? '')
  const response = await api(`/v1/payouts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${await token()}`,
    },
    body: JSON.stringify({
      provider,
      amountCents: dollarsToCents(String(formData.get('amount') ?? '')),
      destination: String(formData.get('destination') ?? ''),
    }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    redirect(`/developers?error=${encodeURIComponent(body?.error ?? 'Payout failed')}`)
  }
  const body = (await response.json()) as { mode?: string; creditValueCents?: number; provider?: string }
  const note = body.provider === 'api_credits' ? `credits-${body.creditValueCents}` : (body.mode ?? 'paid')
  redirect(`/developers?notice=${encodeURIComponent(note)}`)
}

export async function googleSignIn(formData: FormData) {
  if (formData.get('adult') !== 'yes') redirect('/login?error=adult')
  redirect('/login?error=google')
}

export async function loginAccount(formData: FormData) {
  if (formData.get('adult') !== 'yes') redirect('/login?error=adult')
  const response = await api(`/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    }),
    cache: 'no-store',
  })
  if (!response.ok) redirect('/login?error=retry')
  const body = (await response.json()) as { token: string; user: { role: string; setupComplete?: boolean } }
  const jar = await cookies()
  jar.set('swag_session', body.token, { httpOnly: true, sameSite: 'lax', path: '/' })
  if (body.user.setupComplete === false) redirect('/login')
  const next = String(formData.get('next') ?? '')
  if (next.startsWith('/') && !next.startsWith('//')) redirect(next)
  redirect(body.user.role === 'advertiser' ? '/advertisers' : '/developers')
}

export async function signupAccount(formData: FormData) {
  if (formData.get('adult') !== 'yes') redirect('/signup?error=Confirm%20that%20you%20are%2018%20or%20older%20and%20agree%20to%20the%20terms.')
  const response = await api(`/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: String(formData.get('email') ?? ''),
      name: String(formData.get('name') ?? ''),
      password: String(formData.get('password') ?? ''),
      role: String(formData.get('role') ?? 'developer'),
    }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    redirect(`/signup?error=${encodeURIComponent(body?.error ?? 'Could not create the account')}`)
  }
  const body = (await response.json()) as { token: string; user: { role: string; setupComplete?: boolean } }
  const jar = await cookies()
  jar.set('swag_session', body.token, { httpOnly: true, sameSite: 'lax', path: '/' })
  if (body.user.setupComplete === false) redirect('/login')
  redirect(body.user.role === 'advertiser' ? '/advertise' : '/developers')
}

export type FormState = { errors: Record<string, string> } | null

export async function checkoutBlocks(_prev: FormState, formData: FormData): Promise<FormState> {
  const draft = buyDraft(formData)
  const checked = validateBuyPayload({ ...draft, requireEmail: !(await token()) })
  if (!checked.ok) return { errors: checked.errors }
  let session = await token()
  if (!session) {
    const linked = await openAdvertiserSession(String(formData.get('email') ?? ''))
    if ('errors' in linked) return linked
    session = linked.token
  }
  let response: Response
  try {
    response = await api(`/v1/checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session}`,
      },
      body: JSON.stringify({
        strict: true,
        text: draft.text,
        destinationUrl: draft.destinationUrl,
        companyName: draft.companyName,
        brandIconDataUrl: draft.brandIconDataUrl,
        emailInvoice: draft.emailInvoice,
        blocks: draft.blocks,
        bid: draft.bid,
        placement: draft.placement,
        tool: draft.tool,
        pace: draft.pace,
        audience: draft.audience,
        countries: draft.countries,
        acknowledgeDelivery: draft.acknowledgeDelivery,
      }),
      cache: 'no-store',
    })
  } catch (error) {
    return { errors: { form: error instanceof Error ? error.message : 'API unavailable' } }
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; errors?: Record<string, string> } | null
    return { errors: body?.errors ?? { form: body?.error ?? 'Checkout failed' } }
  }
  redirect('/advertisers?notice=checkout')
}

export async function requestMagicLink(_prev: MagicState, formData: FormData): Promise<MagicState> {
  if (formData.get('adult') !== 'yes') {
    return { error: 'Confirm that you are 18 or older and agree to the terms.' }
  }
  const response = await api(`/v1/auth/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: String(formData.get('email') ?? ''),
      adult: true,
      role: 'developer',
    }),
    cache: 'no-store',
  })
  const body = (await response.json().catch(() => null)) as { error?: string; devToken?: string } | null
  if (!response.ok) return { error: body?.error ?? 'Could not start sign-in.' }
  return {
    email: String(formData.get('email') ?? ''),
    devToken: body?.devToken,
    sent: true,
  }
}

export async function consumeMagicLink(formData: FormData) {
  const response = await api(`/v1/auth/magic-link/consume`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: String(formData.get('token') ?? '') }),
    cache: 'no-store',
  })
  if (!response.ok) redirect('/login?error=retry')
  const body = (await response.json()) as { token: string }
  const jar = await cookies()
  jar.set('swag_session', body.token, { httpOnly: true, sameSite: 'lax', path: '/' })
  const next = String(formData.get('next') ?? '')
  redirect(next.startsWith('/') && !next.startsWith('//') ? `/login?next=${encodeURIComponent(next)}` : '/login')
}

export async function completeSetup(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = validateSetup({
    country: String(formData.get('country') ?? ''),
    newsOptIn: formData.get('newsOptIn') === 'yes',
    payoutPreference: String(formData.get('payoutPreference') ?? ''),
  })
  if (!parsed.ok) return { errors: parsed.errors }
  const response = await api(`/v1/auth/setup`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${await token()}`,
    },
    body: JSON.stringify(parsed.value),
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; errors?: Record<string, string> } | null
    return { errors: body?.errors ?? { form: body?.error ?? 'Could not save setup' } }
  }
  const next = String(formData.get('next') ?? '')
  if (next.startsWith('/') && !next.startsWith('//')) redirect(next)
  redirect('/developers')
}

export async function reactivateAccount() {
  await api(`/v1/account/deletion`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${await token()}`,
    },
    body: JSON.stringify({ action: 'reactivate' }),
    cache: 'no-store',
  })
  redirect('/login')
}

export async function keepDeletion() {
  const jar = await cookies()
  jar.delete('swag_session')
  redirect('/login?notice=deletion')
}

export async function submitPrivacy(_prev: FormState, formData: FormData): Promise<FormState> {
  const path = formData.get('path') === 'session' ? 'session' : formData.get('cantLogin') === 'yes' ? 'email' : ''
  const parsed = validatePrivacyRequest({
    kind: String(formData.get('kind') ?? ''),
    email: String(formData.get('email') ?? ''),
    region: String(formData.get('region') ?? ''),
    details: String(formData.get('details') ?? ''),
    authorizedAgent: formData.get('authorizedAgent') === 'yes',
    honeypot: String(formData.get('companyWebsite') ?? ''),
    path,
  })
  if (!parsed.ok) return { errors: parsed.errors }
  if ('discarded' in parsed) redirect('/privacy-choices?notice=received')
  const response = await api(`/v1/privacy-requests`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(await token() ? { authorization: `Bearer ${await token()}` } : {}),
    },
    body: JSON.stringify({
      ...parsed.value,
      authorizedAgent: parsed.value.authorizedAgent,
      companyWebsite: String(formData.get('companyWebsite') ?? ''),
    }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; errors?: Record<string, string> } | null
    return { errors: body?.errors ?? { form: body?.error ?? 'Could not store the request' } }
  }
  redirect('/privacy-choices?notice=received')
}

export async function submitContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = validateContact({
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    topic: String(formData.get('topic') ?? ''),
    message: String(formData.get('message') ?? ''),
    honeypot: String(formData.get('companyWebsite') ?? ''),
  })
  if (!parsed.ok) return { errors: parsed.errors }
  if ('discarded' in parsed) redirect('/contact?notice=received')
  const response = await api(`/v1/contact`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed.value),
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; errors?: Record<string, string> } | null
    return { errors: body?.errors ?? { form: body?.error ?? 'Could not store the message' } }
  }
  redirect('/contact?notice=received')
}

export type MagicState = { error?: string; email?: string; devToken?: string; sent?: boolean } | null

function buyDraft(formData: FormData) {
  return {
    text: String(formData.get('text') ?? ''),
    destinationUrl: String(formData.get('destinationUrl') ?? ''),
    companyName: String(formData.get('companyName') ?? ''),
    brandIconDataUrl: String(formData.get('brandIcon') ?? ''),
    emailInvoice: formData.get('emailInvoice') === 'yes',
    blocks: Number(formData.get('blocks') ?? ''),
    bid: String(formData.get('bid') ?? ''),
    placement: String(formData.get('placement') ?? ''),
    tool: String(formData.get('tool') ?? ''),
    pace: String(formData.get('pace') ?? ''),
    audience: String(formData.get('audience') ?? ''),
    countries: formData.getAll('countries').map(String),
    acknowledgeDelivery: formData.get('acknowledgeDelivery') === 'yes',
    email: String(formData.get('email') ?? ''),
  }
}

async function openAdvertiserSession(email: string): Promise<{ token: string } | { errors: Record<string, string> }> {
  const sent = await api(`/v1/auth/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, role: 'advertiser' }),
    cache: 'no-store',
  })
  const link = (await sent.json().catch(() => null)) as { error?: string; devToken?: string } | null
  if (!sent.ok || !link?.devToken) {
    return { errors: { email: link?.error ?? 'Sign in on the login page, then come back to buy.' } }
  }
  const consumed = await api(`/v1/auth/magic-link/consume`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: link.devToken }),
    cache: 'no-store',
  })
  if (!consumed.ok) return { errors: { email: 'Could not open an advertiser session for that email.' } }
  const body = (await consumed.json()) as { token: string }
  const jar = await cookies()
  jar.set('swag_session', body.token, { httpOnly: true, sameSite: 'lax', path: '/' })
  return { token: body.token }
}

function dollarsToCents(raw: string): number {
  const trimmed = raw.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Enter a dollar amount with at most two decimal places')
  }
  const [whole, fraction = ''] = trimmed.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
