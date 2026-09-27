import { assertDisplayString } from '@swag-money/crypto'
import type { Surface } from '@swag-money/shared'

export type TextSlot = {
  textContent: string | null
}

export type HostRule = {
  id: Surface
  hosts: readonly string[]
  selectors: readonly string[]
}

/** Best-effort generating-state selectors. They are not a contract with the host site. */
export const HOST_RULES: readonly HostRule[] = [
  { id: 'chatgpt', hosts: ['chatgpt.com'], selectors: ['[data-testid="stop-button"]', '[aria-label="Stop streaming"]'] },
  { id: 'claude-web', hosts: ['claude.ai'], selectors: ['[aria-label="Stop response"]', '[data-testid="stop-button"]'] },
  { id: 'gemini-web', hosts: ['gemini.google.com'], selectors: ['[aria-label="Stop"]', '[data-testid="stop-button"]'] },
  { id: 'grok', hosts: ['grok.com'], selectors: ['[aria-label="Stop"]', '[data-testid="stop-button"]'] },
  { id: 'perplexity', hosts: ['perplexity.ai', 'www.perplexity.ai'], selectors: ['[aria-label="Stop"]', '[data-testid="stop-button"]'] },
  { id: 'deepseek', hosts: ['chat.deepseek.com'], selectors: ['[aria-label="Stop"]', '[data-testid="stop-button"]'] },
  { id: 'mistral', hosts: ['chat.mistral.ai'], selectors: ['[aria-label="Stop"]', '[data-testid="stop-button"]'] },
  { id: 'v0', hosts: ['v0.dev'], selectors: ['[aria-label="Stop"]', '[data-testid="stop-button"]'] },
  { id: 'bolt', hosts: ['bolt.new'], selectors: ['[aria-label="Stop"]', '[data-testid="stop-button"]'] },
  { id: 'lovable', hosts: ['lovable.dev'], selectors: ['[aria-label="Stop"]', '[data-testid="stop-button"]'] },
  { id: 'replit', hosts: ['replit.com'], selectors: ['[aria-label="Stop"]', '[data-testid="stop-button"]'] },
]

export function surfaceForHost(hostname: string): Surface {
  const rule = HOST_RULES.find((entry) => entry.hosts.includes(hostname))
  return rule?.id ?? 'browser'
}

export function findGeneratingAnchor(
  doc: Pick<Document, 'querySelector'>,
  hostname: string,
): Element | null {
  const rule = HOST_RULES.find((entry) => entry.hosts.includes(hostname))
  if (!rule) return null
  for (const selector of rule.selectors) {
    const node = doc.querySelector(selector)
    if (node) return node
  }
  return null
}

/** The only DOM write this adapter performs. */
export function applyAdText(element: TextSlot, text: string): void {
  assertDisplayString(text)
  element.textContent = text
}

const THINKING = /^(thinking|pondering|working|claude is thinking)/i

export function findWaitState(
  doc: Pick<Document, 'querySelector' | 'querySelectorAll'>,
  _hostname?: string,
): (TextSlot & Element) | null {
  const marked = doc.querySelector('#swag-money-slot, [data-swag-money-slot]')
  if (marked) return marked as TextSlot & Element
  const candidates = doc.querySelectorAll('[data-testid="thinking"], [aria-label="Thinking"]')
  for (const candidate of candidates) {
    if (THINKING.test(candidate.textContent ?? '')) return candidate as TextSlot & Element
  }
  return null
}
