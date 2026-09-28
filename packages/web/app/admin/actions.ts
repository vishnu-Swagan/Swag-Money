'use server'

import { notFound, redirect } from 'next/navigation'
import { api } from '../../lib/api'
import { requireAdmin } from '../../lib/admin'

async function write(path: string, body: Record<string, unknown>, back: string) {
  await requireAdmin()
  const response = await api(path, { method: 'POST', body: JSON.stringify(body) })
  if (response.status === 404) notFound()
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    const error = data?.error ?? 'Could not save'
    redirect(`${back}${back.includes('?') ? '&' : '?'}error=${encodeURIComponent(error)}`)
  }
  redirect(`${back}${back.includes('?') ? '&' : '?'}notice=saved`)
}

export async function setDeveloperStatus(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  await write(`/v1/admin/developers/${id}/status`, { status }, `/admin/developers/${id}`)
}

export async function addNote(formData: FormData) {
  const back = String(formData.get('back') ?? '/admin')
  await write('/v1/admin/notes', {
    subjectType: String(formData.get('subjectType') ?? ''),
    subjectId: String(formData.get('subjectId') ?? ''),
    body: String(formData.get('body') ?? ''),
  }, back)
}

export async function addTag(formData: FormData) {
  const back = String(formData.get('back') ?? '/admin')
  await write('/v1/admin/tags', {
    subjectType: String(formData.get('subjectType') ?? ''),
    subjectId: String(formData.get('subjectId') ?? ''),
    tag: String(formData.get('tag') ?? ''),
  }, back)
}

export async function removeTag(formData: FormData) {
  const back = String(formData.get('back') ?? '/admin')
  await write('/v1/admin/tags/remove', {
    subjectType: String(formData.get('subjectType') ?? ''),
    subjectId: String(formData.get('subjectId') ?? ''),
    tag: String(formData.get('tag') ?? ''),
  }, back)
}

export async function reviewPayout(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const back = String(formData.get('back') ?? '/admin/payouts')
  await write(`/v1/admin/payouts/${id}/review`, {}, back)
}

export async function saveAdvertiser(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const back = String(formData.get('back') ?? `/admin/advertisers/${id}`)
  await write(`/v1/admin/advertisers/${id}`, {
    pipelineStage: String(formData.get('pipelineStage') ?? ''),
    owner: String(formData.get('owner') ?? ''),
    company: String(formData.get('company') ?? ''),
    followUpAt: String(formData.get('followUpAt') ?? ''),
  }, back)
}

export async function setLeadStatus(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const back = String(formData.get('back') ?? '/admin/leads')
  await write(`/v1/admin/leads/${id}/status`, { status: String(formData.get('status') ?? '') }, back)
}
