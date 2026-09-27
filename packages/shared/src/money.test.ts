import { describe, expect, it } from 'vitest'
import {
  DomainError,
  PAYOUT_MIN_CENTS,
  apiCreditValueCents,
  assertPayoutAmount,
  formatUsd,
  splitRevenue,
} from './index.ts'

describe('revenue split', () => {
  it('splits even prices in half', () => {
    expect(splitRevenue(50)).toEqual({ developerCents: 25, platformCents: 25 })
  })

  it('gives the indivisible cent to the platform', () => {
    expect(splitRevenue(51)).toEqual({ developerCents: 25, platformCents: 26 })
  })

  it('splits zero and rejects garbage', () => {
    expect(splitRevenue(0)).toEqual({ developerCents: 0, platformCents: 0 })
    expect(() => splitRevenue(1.5)).toThrow(DomainError)
    expect(() => splitRevenue(-1)).toThrow(DomainError)
  })
})

describe('payout threshold and API credits', () => {
  it('adds a 10% bonus with integer flooring', () => {
    expect(apiCreditValueCents(1000)).toEqual({ bonusCents: 100, creditValueCents: 1100 })
    expect(apiCreditValueCents(1001)).toEqual({ bonusCents: 100, creditValueCents: 1101 })
  })

  it('blocks payouts under $10 and over the balance', () => {
    expect(PAYOUT_MIN_CENTS).toBe(1000)
    expect(() => assertPayoutAmount(5000, 999, PAYOUT_MIN_CENTS)).toThrowError(/Minimum payout/)
    expect(() => assertPayoutAmount(1200, 1201, PAYOUT_MIN_CENTS)).toThrowError(/exceeds/)
    expect(() => assertPayoutAmount(2000, 1000, PAYOUT_MIN_CENTS)).not.toThrow()
  })

  it('formats cents as dollars', () => {
    expect(formatUsd(1200)).toBe('$12.00')
    expect(formatUsd(5)).toBe('$0.05')
    expect(formatUsd(-25)).toBe('-$0.25')
  })
})
