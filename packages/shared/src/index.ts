export const MIN_VIEW_MS = 5_000
export const PAYOUT_MIN_CENTS = 1_000
export const AUCTION_RESERVE_CENTS = 2
export const AUCTION_INCREMENT_CENTS = 1
export const IMPRESSION_TTL_MS = 120_000
export const AD_TEXT_MAX = 80
export const ADVERTISER_MAX = 40
export const NAME_MAX = 60
/** Default developer share. 5000 = 50%. Raise with SWAG_DEVELOPER_SHARE_BPS. */
export const DEFAULT_DEVELOPER_SHARE_BPS = 5_000
export const IMPRESSIONS_PER_BLOCK = 1_000
export const MIN_BLOCK_BID_CENTS = 50
export const MAX_BLOCKS = 100
export const MAX_TARGET_COUNTRIES = 20
/** Added to the invoice, not to the auction budget, when any country is selected. */
export const COUNTRY_SURCHARGE_PER_BLOCK_CENTS = 75

export {
  isSurface,
  normalizeCountries,
  placementForSurface,
  PLACEMENTS,
  SURFACES,
  surfacesForPlacement,
  TOOLS,
  toolById,
  type IntegrationStatus,
  type Placement,
  type Surface,
  type ToolIntegration,
} from './catalog.ts'

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

export function splitRevenue(
  priceCents: number,
  developerShareBps: number = DEFAULT_DEVELOPER_SHARE_BPS,
): { developerCents: number; platformCents: number } {
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new DomainError('bad_amount', 'priceCents must be a non-negative integer')
  }
  if (!Number.isInteger(developerShareBps) || developerShareBps < 0 || developerShareBps > 10_000) {
    throw new DomainError('bad_share', 'developerShareBps must be an integer from 0 to 10000')
  }
  const developerCents = Math.floor((priceCents * developerShareBps) / 10_000)
  const platformCents = priceCents - developerCents
  return { developerCents, platformCents }
}

export type BlockQuote = {
  blocks: number
  impressions: number
  bidPerBlockCents: number
  countrySurchargeCents: number
  totalCents: number
  maxBidCents: number
  budgetCents: number
  impressionCredits: number
  estimatedImpressionsAtMaxBid: number
}

/** A block is 1,000 impression credits prepaid at the bid. The live auction still clears per impression. */
export function quoteImpressionBlocks(input: {
  blocks: number
  bidPerBlockCents: number
  countryCount: number
}): BlockQuote {
  if (!Number.isInteger(input.blocks) || input.blocks < 1 || input.blocks > MAX_BLOCKS) {
    throw new DomainError('bad_blocks', `blocks must be an integer from 1 to ${MAX_BLOCKS}`)
  }
  if (!Number.isInteger(input.bidPerBlockCents) || input.bidPerBlockCents < MIN_BLOCK_BID_CENTS) {
    throw new DomainError('bid_floor', `Bid per block must be at least ${MIN_BLOCK_BID_CENTS} cents`)
  }
  if (
    !Number.isInteger(input.countryCount) ||
    input.countryCount < 0 ||
    input.countryCount > MAX_TARGET_COUNTRIES
  ) {
    throw new DomainError('bad_countries', `Choose at most ${MAX_TARGET_COUNTRIES} countries`)
  }
  const countrySurchargeCents =
    input.countryCount > 0 ? COUNTRY_SURCHARGE_PER_BLOCK_CENTS * input.blocks : 0
  const budgetCents = input.blocks * input.bidPerBlockCents
  const maxBidCents = Math.max(AUCTION_RESERVE_CENTS, Math.round(input.bidPerBlockCents / IMPRESSIONS_PER_BLOCK))
  return {
    blocks: input.blocks,
    impressions: input.blocks * IMPRESSIONS_PER_BLOCK,
    bidPerBlockCents: input.bidPerBlockCents,
    countrySurchargeCents,
    totalCents: budgetCents + countrySurchargeCents,
    maxBidCents,
    budgetCents,
    impressionCredits: input.blocks * IMPRESSIONS_PER_BLOCK,
    estimatedImpressionsAtMaxBid: Math.floor(budgetCents / maxBidCents),
  }
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
  /** Empty or omitted means every country. */
  countries?: readonly string[]
  /** Omitted or "any" matches every placement. */
  placement?: string
}

export function matchesInventory(
  candidate: AuctionCandidate,
  surface: string,
  opts?: { country?: string; placement?: string },
): boolean {
  if (!(candidate.surfaces.includes(surface) || candidate.surfaces.includes('any'))) return false
  if (
    candidate.placement &&
    candidate.placement !== 'any' &&
    opts?.placement &&
    candidate.placement !== opts.placement
  ) {
    return false
  }
  const countries = candidate.countries ?? []
  if (countries.length > 0) {
    const wanted = opts?.country?.trim().toUpperCase()
    if (!wanted || !countries.some((code) => code.toUpperCase() === wanted)) return false
  }
  return true
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
  opts?: { reserveCents?: number; incrementCents?: number; country?: string; placement?: string },
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
    .filter((candidate) => matchesInventory(candidate, surface, opts))
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
