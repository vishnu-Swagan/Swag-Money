'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { API_URL } from '../lib/api'

async function token(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get('swag_session')?.value
}

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const next = String(formData.get('next') ?? '')
  let response: Response
  try {
    response = await fetch(`${API_URL}/v1/demo/session`, {
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
    response = await fetch(`${API_URL}/v1/campaigns`, {
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
  const response = await fetch(`${API_URL}/v1/campaigns/${id}`, {
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
  const response = await fetch(`${API_URL}/v1/payouts`, {
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

function dollarsToCents(raw: string): number {
  const trimmed = raw.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Enter a dollar amount with at most two decimal places')
  }
  const [whole, fraction = ''] = trimmed.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
