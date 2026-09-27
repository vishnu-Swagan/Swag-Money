import {
  ADVERTISER_MAX,
  COMPANY_NAME_MAX,
  MAX_BLOCKS,
  MAX_TARGET_COUNTRIES,
  MIN_BLOCK_BID_CENTS,
  quoteImpressionBlocks,
  type BlockQuote,
} from './index.ts'
import { toolById, surfacesForPlacement, type Placement, type Surface } from './catalog.ts'

export const AD_LINE_MIN = 3
export const AD_LINE_MAX = 60
export const BRAND_ICON_MAX_BYTES = 64 * 1024
export const PACES = ['slow', 'medium', 'fast'] as const
export type Pace = (typeof PACES)[number]

export const PAYOUT_PREFERENCES = ['upi', 'stripe', 'crypto', 'api_credits'] as const
export type PayoutPreference = (typeof PAYOUT_PREFERENCES)[number]

export const PRIVACY_KINDS = ['access', 'correct', 'delete', 'do-not-sell', 'appeal', 'other'] as const
export type PrivacyKind = (typeof PRIVACY_KINDS)[number]

export const CONTACT_TOPICS = ['advertiser', 'developer', 'privacy', 'press', 'security'] as const
export type ContactTopic = (typeof CONTACT_TOPICS)[number]

/** Residence and audience codes. Names are ours; codes are ISO 3166-1 alpha-2. */
export const COUNTRIES: readonly { code: string; name: string }[] = [
  ['AR', 'Argentina'],
  ['AU', 'Australia'],
  ['AT', 'Austria'],
  ['BD', 'Bangladesh'],
  ['BE', 'Belgium'],
  ['BR', 'Brazil'],
  ['BG', 'Bulgaria'],
  ['CA', 'Canada'],
  ['CL', 'Chile'],
  ['CO', 'Colombia'],
  ['HR', 'Croatia'],
  ['CY', 'Cyprus'],
  ['CZ', 'Czechia'],
  ['DK', 'Denmark'],
  ['EG', 'Egypt'],
  ['EE', 'Estonia'],
  ['FI', 'Finland'],
  ['FR', 'France'],
  ['DE', 'Germany'],
  ['GH', 'Ghana'],
  ['GR', 'Greece'],
  ['HK', 'Hong Kong'],
  ['HU', 'Hungary'],
  ['IS', 'Iceland'],
  ['IN', 'India'],
  ['ID', 'Indonesia'],
  ['IE', 'Ireland'],
  ['IL', 'Israel'],
  ['IT', 'Italy'],
  ['JP', 'Japan'],
  ['KE', 'Kenya'],
  ['LV', 'Latvia'],
  ['LT', 'Lithuania'],
  ['LU', 'Luxembourg'],
  ['MY', 'Malaysia'],
  ['MX', 'Mexico'],
  ['MA', 'Morocco'],
  ['NL', 'Netherlands'],
  ['NZ', 'New Zealand'],
  ['NG', 'Nigeria'],
  ['NO', 'Norway'],
  ['PK', 'Pakistan'],
  ['PH', 'Philippines'],
  ['PL', 'Poland'],
  ['PT', 'Portugal'],
  ['QA', 'Qatar'],
  ['RO', 'Romania'],
  ['SA', 'Saudi Arabia'],
  ['SG', 'Singapore'],
  ['SK', 'Slovakia'],
  ['SI', 'Slovenia'],
  ['ZA', 'South Africa'],
  ['KR', 'South Korea'],
  ['ES', 'Spain'],
  ['SE', 'Sweden'],
  ['CH', 'Switzerland'],
  ['TW', 'Taiwan'],
  ['TH', 'Thailand'],
  ['TR', 'Turkey'],
  ['AE', 'United Arab Emirates'],
  ['GB', 'United Kingdom'],
  ['US', 'United States'],
  ['VN', 'Vietnam'],
].map(([code, name]) => ({ code, name }))

const COUNTRY_SET = new Set(COUNTRIES.map((country) => country.code))

export function countryName(code: string): string {
  return COUNTRIES.find((country) => country.code === code)?.name ?? code
}

export type FieldErrors = Record<string, string>

export type DeliveryForecast = {
  pace: Pace
  headline: string
  detail: string
}

/** Pace changes queue position only. The invoice total does not depend on it, and the label is not a measured wait. */
export function forecastDelivery(pace: Pace, bidPerBlockCents: number): DeliveryForecast {
  const floor = bidPerBlockCents <= MIN_BLOCK_BID_CENTS
  if (floor) {
    return {
      pace,
      headline: 'Can stall behind higher bids',
      detail:
        'The floor bid is the minimum. Anything higher is ahead of it. Pace does not change the price, and this label is not a count of impressions waiting on the ledger.',
    }
  }
  if (pace === 'fast') {
    return {
      pace,
      headline: 'Ahead of slower bids',
      detail:
        'Fast pacing is ordered before slow campaigns at the same bid. The price does not go up. Only Claude Code CLI is a working surface, so a beta or scaffold tool will not deliver until that adapter runs.',
    }
  }
  if (pace === 'slow') {
    return {
      pace,
      headline: 'Can take more than a month',
      detail:
        'Slow pacing yields to faster campaigns. The price stays the same. This is a label, not a published order book.',
    }
  }
  return {
    pace,
    headline: 'Often weeks, not hours',
    detail:
      'Medium is the default pace. Delivery still waits on verified impressions. Pace does not change the price.',
  }
}

export type NormalizedBuy = {
  name: string
  text: string
  destinationUrl: string
  companyName: string
  advertiserName: string
  brandIconDataUrl: string
  emailInvoice: boolean
  blocks: number
  bidPerBlockCents: number
  surfaces: Surface[]
  placement: Placement
  countries: string[]
  pace: Pace
  quote: BlockQuote
  forecast: DeliveryForecast
}

export function validateBuyPayload(input: {
  text: unknown
  destinationUrl: unknown
  companyName: unknown
  brandIconDataUrl?: unknown
  emailInvoice?: unknown
  blocks: unknown
  bid?: unknown
  placement: unknown
  tool?: unknown
  pace: unknown
  audience: unknown
  countries?: unknown
  acknowledgeDelivery: unknown
  email?: unknown
  requireEmail?: boolean
}): { ok: true; value: NormalizedBuy } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (text.length < AD_LINE_MIN || text.length > AD_LINE_MAX || !isPrintableAscii(text)) {
    errors.text = `The ad line must be ${AD_LINE_MIN} to ${AD_LINE_MAX} printable ASCII characters.`
  }
  const destinationUrl = typeof input.destinationUrl === 'string' ? input.destinationUrl.trim() : ''
  if (!isHttps(destinationUrl)) {
    errors.destinationUrl = 'Use an https destination, 500 characters or fewer.'
  }
  const companyName = typeof input.companyName === 'string' ? input.companyName.trim() : ''
  if (companyName.length < 1 || companyName.length > COMPANY_NAME_MAX || !isPrintableAscii(companyName)) {
    errors.companyName = `Company or brand name must be 1 to ${COMPANY_NAME_MAX} printable ASCII characters.`
  }
  const brandIconDataUrl = typeof input.brandIconDataUrl === 'string' ? input.brandIconDataUrl.trim() : ''
  const icon = inspectBrandIcon(brandIconDataUrl)
  if (!icon.ok) errors.brandIcon = icon.error

  const blocks = typeof input.blocks === 'number' ? input.blocks : Number(input.blocks)
  if (!Number.isInteger(blocks) || blocks < 1 || blocks > MAX_BLOCKS) {
    errors.blocks = `Blocks must be a whole number from 1 to ${MAX_BLOCKS}.`
  }
  const bidPerBlockCents = parseBid(input.bid)
  if (bidPerBlockCents === null || bidPerBlockCents < MIN_BLOCK_BID_CENTS) {
    errors.bid = 'Bid at least $0.50 per 1,000 impressions.'
  }
  const pace: Pace | null = input.pace === 'slow' || input.pace === 'medium' || input.pace === 'fast' ? input.pace : null
  if (!pace) errors.pace = 'Choose slow, medium, or fast. The price does not change.'
  const audience = input.audience === 'countries' ? 'countries' : input.audience === 'everywhere' ? 'everywhere' : ''
  if (!audience) errors.audience = 'Choose everywhere, or a list of countries.'
  let countries: string[] = []
  if (audience === 'countries') {
    const raw = Array.isArray(input.countries) ? input.countries : []
    if (raw.some((code) => typeof code !== 'string')) {
      errors.countries = 'Country codes must be text.'
    } else {
      countries = [...new Set(raw.map((code) => code.trim().toUpperCase()))]
      if (countries.length < 1 || countries.length > MAX_TARGET_COUNTRIES) {
        errors.countries = `Select 1 to ${MAX_TARGET_COUNTRIES} countries.`
      } else if (countries.some((code) => !COUNTRY_SET.has(code))) {
        errors.countries = 'Use a country from the list.'
      }
    }
  }
  const targeted = resolveSurface(input.placement, input.tool)
  if ('error' in targeted) errors.placement = targeted.error

  if (input.acknowledgeDelivery !== true) {
    errors.acknowledgeDelivery = 'Confirm that delivery can take a long time and can stall behind higher bids.'
  }
  if (input.requireEmail) {
    const email = typeof input.email === 'string' ? input.email.trim() : ''
    if (!isEmail(email)) errors.email = 'Enter the email for the receipt and the advertiser account.'
  }
  if (Object.keys(errors).length > 0 || bidPerBlockCents === null || !pace || !('surfaces' in targeted)) {
    return { ok: false, errors }
  }
  const quote = quoteImpressionBlocks({
    blocks,
    bidPerBlockCents,
    countryCount: countries.length,
  })
  return {
    ok: true,
    value: {
      name: companyName.slice(0, 60),
      text,
      destinationUrl,
      companyName,
      advertiserName: companyName.slice(0, ADVERTISER_MAX),
      brandIconDataUrl,
      emailInvoice: input.emailInvoice === true,
      blocks,
      bidPerBlockCents,
      surfaces: targeted.surfaces,
      placement: targeted.placement,
      countries,
      pace,
      quote,
      forecast: forecastDelivery(pace, bidPerBlockCents),
    },
  }
}

export function inspectBrandIcon(value: string): { ok: true } | { ok: false; error: string } {
  if (!value) return { ok: true }
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) return { ok: false, error: 'Icon must be a PNG, JPG, or WebP file.' }
  const bytes = decodeBase64(match[2] ?? '')
  if (!bytes) return { ok: false, error: 'Icon must be a PNG, JPG, or WebP file.' }
  if (bytes.length > BRAND_ICON_MAX_BYTES) {
    return { ok: false, error: 'Icon must be 64 KB or smaller.' }
  }
  const kind = match[1]
  if (kind === 'png' && !startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return { ok: false, error: 'That file is not a PNG.' }
  }
  if (kind === 'jpeg' && !startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { ok: false, error: 'That file is not a JPEG.' }
  }
  if (kind === 'webp' && !(asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP'))) {
    return { ok: false, error: 'That file is not a WebP.' }
  }
  return { ok: true }
}

export function validatePrivacyRequest(input: {
  kind: unknown
  email: unknown
  region?: unknown
  details?: unknown
  authorizedAgent?: unknown
  honeypot?: unknown
  path: unknown
}): { ok: true; value: PrivacyRequest } | { ok: false; errors: FieldErrors } | { ok: true; discarded: true } {
  if (typeof input.honeypot === 'string' && input.honeypot.trim()) {
    return { ok: true, discarded: true }
  }
  const errors: FieldErrors = {}
  const kind = input.kind
  if (!isPrivacyKind(kind)) errors.kind = 'Choose the kind of privacy request.'
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!isEmail(email)) errors.email = 'Enter the email on the account, or the email we should answer.'
  const region = typeof input.region === 'string' ? input.region.trim() : ''
  if (region.length > 80) errors.region = 'State or country must be 80 characters or fewer.'
  const details = typeof input.details === 'string' ? input.details.trim() : ''
  if (details.length > 2000) errors.details = 'Details must be 2,000 characters or fewer.'
  const path = input.path === 'session' || input.path === 'email' ? input.path : ''
  if (!path) errors.path = 'Sign in, or say you cannot log in so we can verify the email.'
  if (Object.keys(errors).length > 0 || !isPrivacyKind(kind) || (path !== 'session' && path !== 'email')) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    value: {
      kind,
      email,
      region,
      details,
      authorizedAgent: input.authorizedAgent === true,
      path,
    },
  }
}

export type PrivacyRequest = {
  kind: PrivacyKind
  email: string
  region: string
  details: string
  authorizedAgent: boolean
  path: 'session' | 'email'
}

export function validateContact(input: {
  name: unknown
  email: unknown
  topic: unknown
  message: unknown
  honeypot?: unknown
}): { ok: true; value: ContactMessage } | { ok: false; errors: FieldErrors } | { ok: true; discarded: true } {
  if (typeof input.honeypot === 'string' && input.honeypot.trim()) {
    return { ok: true, discarded: true }
  }
  const errors: FieldErrors = {}
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 1 || name.length > 120) errors.name = 'Enter your name, up to 120 characters.'
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!isEmail(email)) errors.email = 'Enter an email we can reply to.'
  const topic = input.topic
  if (!isContactTopic(topic)) errors.topic = 'Choose a topic.'
  const message = typeof input.message === 'string' ? input.message.trim() : ''
  if (message.length < 1 || message.length > 4000) errors.message = 'Write a message, up to 4,000 characters.'
  if (Object.keys(errors).length > 0 || !isContactTopic(topic)) return { ok: false, errors }
  return { ok: true, value: { name, email, topic, message } }
}

export type ContactMessage = {
  name: string
  email: string
  topic: ContactTopic
  message: string
}

export function validateSetup(input: {
  country: unknown
  newsOptIn?: unknown
  payoutPreference: unknown
}): { ok: true; value: { country: string; newsOptIn: boolean; payoutPreference: PayoutPreference } } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const country = typeof input.country === 'string' ? input.country.trim().toUpperCase() : ''
  if (!COUNTRY_SET.has(country)) errors.country = 'Choose your country of residence.'
  const payoutPreference = input.payoutPreference
  if (!isPayoutPreference(payoutPreference)) errors.payoutPreference = 'Choose UPI, Stripe, crypto, or API credits.'
  if (Object.keys(errors).length > 0 || !isPayoutPreference(payoutPreference)) return { ok: false, errors }
  return {
    ok: true,
    value: { country, newsOptIn: input.newsOptIn === true, payoutPreference },
  }
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120
}

function parseBid(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value.trim())) return null
  const [whole, fraction = ''] = value.trim().split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

function resolveSurface(
  placement: unknown,
  tool: unknown,
): { surfaces: Surface[]; placement: Placement } | { error: string } {
  if (placement === 'terminal' || placement === 'editor' || placement === 'browser') {
    const surfaces = surfacesForPlacement(placement)
    if (surfaces.length === 0) return { error: 'That placement has no sellable tool.' }
    return { surfaces, placement }
  }
  if (placement === 'tool') {
    const id = typeof tool === 'string' ? tool : ''
    const found = toolById(id)
    if (!found || !found.sellable) return { error: 'Choose a tool from the list.' }
    return { surfaces: [found.surface], placement: found.placement }
  }
  return { error: 'Choose terminal, editor, browser, or a specific tool.' }
}

function isHttps(value: string): boolean {
  if (!value || value.length > 500) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isPrintableAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) return false
  }
  return true
}

function isPrivacyKind(value: unknown): value is PrivacyKind {
  return typeof value === 'string' && (PRIVACY_KINDS as readonly string[]).includes(value)
}

function isContactTopic(value: unknown): value is ContactTopic {
  return typeof value === 'string' && (CONTACT_TOPICS as readonly string[]).includes(value)
}

function isPayoutPreference(value: unknown): value is PayoutPreference {
  return typeof value === 'string' && (PAYOUT_PREFERENCES as readonly string[]).includes(value)
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false
  return magic.every((byte, index) => bytes[index] === byte)
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false
  }
  return true
}
