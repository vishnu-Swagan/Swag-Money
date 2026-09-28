'use server'

import { notFound, redirect } from 'next/navigation'
import { api } from '../../lib/api'

async function write(path: string, body: unknown, back: string) {
  const response = await api(path, { method: 'POST', body: JSON.stringify(body) })
  if (response.status === 404) notFound()
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    const glue = back.includes('?') ? '&' : '?'
    redirect(`${back}${glue}error=${encodeURIComponent(data?.error ?? 'Could not save')}`)
  }
  redirect(back)
}

export async function addNote(formData: FormData) {
  const subjectType = String(formData.get('subjectType') ?? '')
  const subjectId = String(formData.get('subjectId') ?? '')
  const back = String(formData.get('back') ?? '/admin')
  await write('/v1/admin/notes', { subjectType, subjectId, body: String(formData.get('body') ?? '') }, back)
}

export async function addTag(formData: FormData) {
  const back = String(formData.get('back') ?? '/admin')
  await write(
    '/v1/admin/tags',
    {
      subjectType: String(formData.get('subjectType') ?? ''),
      subjectId: String(formData.get('subjectId') ?? ''),
      tag: String(formData.get('tag') ?? ''),
      remove: formData.get('remove') === 'yes',
    },
    back,
  )
}

export async function setSuspended(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  await write(`/v1/admin/developers/${id}/suspend`, { suspended: formData.get('suspended') === 'yes' }, `/admin/developers/${id}`)
}

export async function setPayoutReviewed(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  await write(`/v1/admin/developers/${id}/payout-review`, { reviewed: formData.get('reviewed') !== 'no' }, `/admin/developers/${id}`)
}

export async function savePipeline(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const body: Record<string, string> = { stage: String(formData.get('stage') ?? '') }
  if (formData.has('ownerEmail')) body.ownerEmail = String(formData.get('ownerEmail') ?? '')
  if (formData.has('followUpAt')) body.followUpAt = String(formData.get('followUpAt') ?? '')
  const back = formData.get('back')
  const dest = typeof back === 'string' && back.startsWith('/admin/') ? back : `/admin/advertisers/${id}`
  await write(`/v1/admin/advertisers/${id}/pipeline`, body, dest)
}

export async function setLeadStatus(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const back = String(formData.get('back') ?? '/admin/leads')
  await write(`/v1/admin/leads/${id}/status`, { status: String(formData.get('status') ?? '') }, back)
}
