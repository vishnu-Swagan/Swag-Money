export const MIN_VIEW_MS = 5_000
export const PAYOUT_MIN_CENTS = 1_000
export const AUCTION_RESERVE_CENTS = 2
export const AUCTION_INCREMENT_CENTS = 1
export const IMPRESSION_TTL_MS = 120_000
export const AD_TEXT_MAX = 80
export const ADVERTISER_MAX = 40
export const NAME_MAX = 60

export const SURFACES = ['claude-code', 'vscode', 'browser', 'jetbrains'] as const
export type Surface = (typeof SURFACES)[number]

export function isSurface(value: string): value is Surface {
  return (SURFACES as readonly string[]).includes(value)
}

export function formatUsd(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const rest = abs % 100
  return `${negative ? '-' : ''}$${dollars.toString()}.${rest.toString().padStart(2, '0')}`
}

export class DomainError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export function splitRevenue(priceCents: number): { developerCents: number; platformCents: number } {
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new DomainError('bad_amount', 'priceCents must be a non-negative integer')
  }
  const developerCents = Math.floor(priceCents / 2)
  const platformCents = priceCents - developerCents
  return { developerCents, platformCents }
}

/** Convert withdrawable earnings into AI API credits, adding a 10% bonus. */
export function apiCreditValueCents(amountCents: number): { creditValueCents: number; bonusCents: number } {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new DomainError('bad_amount', 'amountCents must be a non-negative integer')
  }
  const bonusCents = Math.floor(amountCents / 10)
  return { bonusCents, creditValueCents: amountCents + bonusCents }
}

export function assertPayoutAmount(balanceCents: number, amountCents: number, minCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new DomainError('bad_amount', 'Payout amount must be a positive integer of cents')
  }
  if (!Number.isInteger(balanceCents) || balanceCents < 0) {
    throw new DomainError('bad_amount', 'balanceCents must be a non-negative integer')
  }
  if (amountCents < minCents) {
    throw new DomainError('below_minimum', `Minimum payout is ${minCents} cents`)
  }
  if (amountCents > balanceCents) {
    throw new DomainError('insufficient', 'Amount exceeds available earnings')
  }
}

export type AuctionCandidate = {
  campaignId: string
  maxBidCents: number
  budgetRemainingCents: number
  createdAtMs: number
  surfaces: readonly string[]
}

export type AuctionWinner = {
  campaignId: string
  priceCents: number
  maxBidCents: number
  secondMaxBidCents: number | null
}

/**
 * Proxy English auction for one impression.
 * The winner is the highest max bid that can afford the clearing price.
 * Clearing price is the reserve when nobody else bids, otherwise
 * min(winner max, second-highest max + increment). Bidders who cannot
 * afford their own clearing price are removed and do not set the price.
 */
export function runEnglishAuction(
  candidates: readonly AuctionCandidate[],
  surface: string,
  opts?: { reserveCents?: number; incrementCents?: number },
): AuctionWinner | null {
  const reserve = opts?.reserveCents ?? AUCTION_RESERVE_CENTS
  const increment = opts?.incrementCents ?? AUCTION_INCREMENT_CENTS
  if (!Number.isInteger(reserve) || reserve < 1) {
    throw new DomainError('bad_auction', 'reserve must be a positive integer')
  }
  if (!Number.isInteger(increment) || increment < 1) {
    throw new DomainError('bad_auction', 'increment must be a positive integer')
  }

  const pool = candidates
    .filter((candidate) => candidate.surfaces.includes(surface) || candidate.surfaces.includes('any'))
    .filter((candidate) => candidate.maxBidCents >= reserve && candidate.budgetRemainingCents >= reserve)
    .slice()
    .sort((a, b) => b.maxBidCents - a.maxBidCents || a.createdAtMs - b.createdAtMs)

  while (pool.length > 0) {
    const candidate = pool[0]!
    const second = pool[1]
    const price = second
      ? Math.min(candidate.maxBidCents, second.maxBidCents + increment)
      : reserve
    const affordable =
      price >= reserve && price <= candidate.maxBidCents && candidate.budgetRemainingCents >= price
    if (affordable) {
      return {
        campaignId: candidate.campaignId,
        priceCents: price,
        maxBidCents: candidate.maxBidCents,
        secondMaxBidCents: second ? second.maxBidCents : null,
      }
    }
    pool.shift()
  }

  return null
}
