import { describe, expect, it } from 'vitest'
import { COUNTRIES, forecastDelivery, quoteImpressionBlocks, validateBuyPayload, validateContact, validatePrivacyRequest, validateSetup } from './index.ts'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function buy(overrides: Record<string, unknown> = {}) {
  return validateBuyPayload({
    text: 'Northwind - ephemeral CI for every pull request',
    destinationUrl: 'https://northwind.example/ci',
    companyName: 'Northwind',
    blocks: 1,
    bid: '2.00',
    placement: 'terminal',
    pace: 'medium',
    audience: 'everywhere',
    acknowledgeDelivery: true,
    ...overrides,
  })
}

describe('buy form validation', () => {
  it('prices a default block and keeps pace off the invoice', () => {
    const medium = buy()
    const fast = buy({ pace: 'fast' })
    const slow = buy({ pace: 'slow' })
    expect(medium.ok).toBe(true)
    expect(fast.ok).toBe(true)
    expect(slow.ok).toBe(true)
    if (!medium.ok || !fast.ok || !slow.ok) return
    expect(medium.value.quote.totalCents).toBe(200)
    expect(fast.value.quote.totalCents).toBe(medium.value.quote.totalCents)
    expect(slow.value.quote.totalCents).toBe(medium.value.quote.totalCents)
    expect(fast.value.forecast.headline).not.toBe(slow.value.forecast.headline)
    expect(medium.value.advertiserName).toBe('Northwind')
    expect(medium.value.surfaces).toContain('claude-code')
  })

  it('adds the country surcharge once, not per country, and caps the list', () => {
    const quoted = buy({ audience: 'countries', countries: ['in', 'US'] })
    expect(quoted.ok).toBe(true)
    if (!quoted.ok) return
    expect(quoted.value.countries).toEqual(['IN', 'US'])
    expect(quoted.value.quote.countrySurchargeCents).toBe(75)
    expect(quoted.value.quote.totalCents).toBe(275)
    const tooMany = buy({ audience: 'countries', countries: COUNTRIES.slice(0, 21).map((country) => country.code) })
    expect(tooMany.ok).toBe(false)
    if (tooMany.ok) return
    expect(tooMany.errors.countries).toMatch(/20/)
  })

  it('rejects a short line, a long line, a cheap bid, a missing acknowledgement, and a huge icon', () => {
    const short = buy({ text: 'No' })
    const long = buy({ text: 'N'.repeat(61) })
    const cheap = buy({ bid: '0.49' })
    const quiet = buy({ acknowledgeDelivery: false })
    const huge = buy({
      brandIconDataUrl: `data:image/png;base64,${'A'.repeat(88000)}`,
    })
    expect(short.ok).toBe(false)
    expect(long.ok).toBe(false)
    expect(cheap.ok).toBe(false)
    expect(quiet.ok).toBe(false)
    expect(huge.ok).toBe(false)
    if (short.ok || long.ok || cheap.ok || quiet.ok || huge.ok) return
    expect(short.errors.text).toMatch(/3 to 60/)
    expect(long.errors.text).toMatch(/3 to 60/)
    expect(cheap.errors.bid).toMatch(/0\.50/)
    expect(quiet.errors.acknowledgeDelivery).toBeTruthy()
    expect(huge.errors.brandIcon).toMatch(/64 KB/)
  })

  it('accepts a small PNG and a single tool', () => {
    const result = buy({ brandIconDataUrl: PNG, placement: 'tool', tool: 'claude-code' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.surfaces).toEqual(['claude-code'])
    expect(result.value.placement).toBe('terminal')
    expect(result.value.brandIconDataUrl).toBe(PNG)
  })

  it('forecasts a floor bid as a stall, at the same price as a faster pace', () => {
    const floor = quoteImpressionBlocks({ blocks: 2, bidPerBlockCents: 50, countryCount: 0 })
    const higher = quoteImpressionBlocks({ blocks: 2, bidPerBlockCents: 200, countryCount: 0 })
    expect(floor.totalCents).toBe(100)
    expect(higher.totalCents).toBe(400)
    expect(forecastDelivery('fast', 50).headline).toMatch(/stall/i)
    expect(forecastDelivery('fast', 200).headline).toMatch(/Ahead/)
  })
})

describe('privacy, contact, and setup validation', () => {
  it('discards a filled honeypot and requires a path', () => {
    const spam = validatePrivacyRequest({
      kind: 'delete',
      email: 'a@b.co',
      path: 'email',
      honeypot: 'http://spam.example',
    })
    expect(spam).toEqual({ ok: true, discarded: true })
    const missing = validatePrivacyRequest({ kind: 'access', email: 'a@b.co', path: 'nope' })
    expect(missing.ok).toBe(false)
    const sell = validatePrivacyRequest({ kind: 'do-not-sell', email: 'a@b.co', path: 'email' })
    expect(sell.ok).toBe(true)
  })

  it('checks contact topics and setup rails', () => {
    const bad = validateContact({ name: 'Ada', email: 'ada@dev.swagmoney.test', topic: 'billing', message: 'Hello' })
    expect(bad.ok).toBe(false)
    const good = validateContact({
      name: 'Ada',
      email: 'ada@dev.swagmoney.test',
      topic: 'developer',
      message: 'Payout question',
      honeypot: '   ',
    })
    expect(good.ok).toBe(true)
    const setup = validateSetup({ country: 'in', payoutPreference: 'upi', newsOptIn: true })
    expect(setup.ok).toBe(true)
    if (!setup.ok) return
    expect(setup.value.country).toBe('IN')
    expect(setup.value.payoutPreference).toBe('upi')
  })
})
