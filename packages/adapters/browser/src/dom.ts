import { assertDisplayString } from '@swag-money/crypto'

export type TextSlot = {
  textContent: string | null
}

/** The only DOM write this adapter performs. */
export function applyAdText(element: TextSlot, text: string): void {
  assertDisplayString(text)
  element.textContent = text
}

const THINKING = /^(thinking|pondering|working|claude is thinking)/i

export function findWaitState(doc: Pick<Document, 'querySelector' | 'querySelectorAll'>): (TextSlot & Element) | null {
  const marked = doc.querySelector('#swag-money-slot, [data-swag-money-slot]')
  if (marked) return marked as TextSlot & Element
  const candidates = doc.querySelectorAll('[data-testid="thinking"], [aria-label="Thinking"]')
  for (const candidate of candidates) {
    if (THINKING.test(candidate.textContent ?? '')) return candidate as TextSlot & Element
  }
  return null
}
