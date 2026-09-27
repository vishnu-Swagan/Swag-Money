import { describe, expect, it } from 'vitest'
import { AUCTION_INCREMENT_CENTS, AUCTION_RESERVE_CENTS, runEnglishAuction, type AuctionCandidate } from './index.ts'

function bid(partial: Partial<AuctionCandidate> & Pick<AuctionCandidate, 'campaignId' | 'maxBidCents'>): AuctionCandidate {
  return {
    budgetRemainingCents: 10_000,
    createdAtMs: 1,
    surfaces: ['claude-code'],
    ...partial,
  }
}

describe('English ascending auction', () => {
  it('clears at the second-highest max plus one increment', () => {
    const winner = runEnglishAuction(
      [
        bid({ campaignId: 'northwind', maxBidCents: 80, createdAtMs: 1 }),
        bid({ campaignId: 'helio', maxBidCents: 50, createdAtMs: 2 }),
      ],
      'claude-code',
    )
    expect(winner).toEqual({
      campaignId: 'northwind',
      priceCents: 51,
      maxBidCents: 80,
      secondMaxBidCents: 50,
    })
    expect(AUCTION_INCREMENT_CENTS).toBe(1)
  })

  it('charges the reserve when a single bidder faces no competition', () => {
    const winner = runEnglishAuction([bid({ campaignId: 'solo', maxBidCents: 80 })], 'claude-code')
    expect(winner?.campaignId).toBe('solo')
    expect(winner?.priceCents).toBe(AUCTION_RESERVE_CENTS)
    expect(winner?.secondMaxBidCents).toBeNull()
  })

  it('breaks ties by earlier creation and caps the price at the max bid', () => {
    const winner = runEnglishAuction(
      [
        bid({ campaignId: 'later', maxBidCents: 40, createdAtMs: 20 }),
        bid({ campaignId: 'earlier', maxBidCents: 40, createdAtMs: 10 }),
      ],
      'claude-code',
    )
    expect(winner?.campaignId).toBe('earlier')
    expect(winner?.priceCents).toBe(40)
  })

  it('skips a high bidder who cannot afford the clearing price without letting them set it', () => {
    const winner = runEnglishAuction(
      [
        bid({ campaignId: 'broke-high', maxBidCents: 100, budgetRemainingCents: 5, createdAtMs: 1 }),
        bid({ campaignId: 'funded', maxBidCents: 50, budgetRemainingCents: 100, createdAtMs: 2 }),
        bid({ campaignId: 'tail', maxBidCents: 10, budgetRemainingCents: 100, createdAtMs: 3 }),
      ],
      'claude-code',
    )
    expect(winner).toMatchObject({ campaignId: 'funded', priceCents: 11, secondMaxBidCents: 10 })
  })

  it('ignores campaigns that do not target the surface', () => {
    const winner = runEnglishAuction(
      [
        bid({ campaignId: 'jetbrains-only', maxBidCents: 90, surfaces: ['jetbrains'] }),
        bid({ campaignId: 'cli', maxBidCents: 20, surfaces: ['claude-code'] }),
      ],
      'claude-code',
    )
    expect(winner?.campaignId).toBe('cli')
    expect(winner?.priceCents).toBe(AUCTION_RESERVE_CENTS)
  })

  it('treats an explicit any-surface campaign as eligible', () => {
    const winner = runEnglishAuction(
      [bid({ campaignId: 'wide', maxBidCents: 15, surfaces: ['any'] })],
      'browser',
    )
    expect(winner?.campaignId).toBe('wide')
  })

  it('returns null when nobody meets the reserve or has budget', () => {
    expect(
      runEnglishAuction(
        [bid({ campaignId: 'low', maxBidCents: 1, budgetRemainingCents: 1 })],
        'claude-code',
      ),
    ).toBeNull()
    expect(runEnglishAuction([], 'vscode')).toBeNull()
  })

  it('caps a one-cent race at the winner max bid', () => {
    const winner = runEnglishAuction(
      [
        bid({ campaignId: 'a', maxBidCents: 10, createdAtMs: 1 }),
        bid({ campaignId: 'b', maxBidCents: 9, createdAtMs: 2 }),
      ],
      'claude-code',
    )
    expect(winner?.priceCents).toBe(10)
  })
})
