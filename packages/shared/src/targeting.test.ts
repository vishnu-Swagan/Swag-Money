import { describe, expect, it } from 'vitest'
import {
  matchesInventory,
  quoteImpressionBlocks,
  runEnglishAuction,
  TOOLS,
  isSurface,
  type AuctionCandidate,
} from './index.ts'

function bid(partial: Partial<AuctionCandidate> & Pick<AuctionCandidate, 'campaignId' | 'maxBidCents'>): AuctionCandidate {
  return {
    budgetRemainingCents: 10_000,
    createdAtMs: 1,
    surfaces: ['claude-code'],
    ...partial,
  }
}

describe('inventory targeting', () => {
  it('keeps an untargeted campaign eligible for every country', () => {
    const winner = runEnglishAuction([bid({ campaignId: 'open', maxBidCents: 40 })], 'claude-code', {
      country: 'IN',
      placement: 'terminal',
    })
    expect(winner?.campaignId).toBe('open')
  })

  it('skips a country list that does not include the request', () => {
    const winner = runEnglishAuction(
      [
        bid({ campaignId: 'us-only', maxBidCents: 80, countries: ['US'], surfaces: ['any'] }),
        bid({ campaignId: 'everywhere', maxBidCents: 20, surfaces: ['gemini-cli'] }),
      ],
      'gemini-cli',
      { country: 'IN', placement: 'terminal' },
    )
    expect(winner?.campaignId).toBe('everywhere')
    expect(
      matchesInventory(
        bid({ campaignId: 'us-only', maxBidCents: 80, countries: ['US'] }),
        'claude-code',
        { country: 'IN' },
      ),
    ).toBe(false)
  })

  it('keeps a terminal buy off an editor request', () => {
    const winner = runEnglishAuction(
      [
        bid({ campaignId: 'term', maxBidCents: 90, placement: 'terminal', surfaces: ['any'] }),
        bid({ campaignId: 'edit', maxBidCents: 30, placement: 'editor', surfaces: ['cursor'] }),
      ],
      'cursor',
      { placement: 'editor' },
    )
    expect(winner?.campaignId).toBe('edit')
  })

  it('prices a block without inventing sub-cent bids', () => {
    const quote = quoteImpressionBlocks({ blocks: 2, bidPerBlockCents: 200, countryCount: 1 })
    expect(quote.impressions).toBe(2000)
    expect(quote.countrySurchargeCents).toBe(150)
    expect(quote.totalCents).toBe(550)
    expect(quote.budgetCents).toBe(400)
    expect(quote.maxBidCents).toBe(2)
    expect(quote.estimatedImpressionsAtMaxBid).toBe(200)
  })
})

describe('tool catalog', () => {
  it('gives every sellable tool a real auction surface and an honest status', () => {
    const statuses = new Set(TOOLS.map((tool) => tool.status))
    expect(statuses).toEqual(new Set(['working', 'beta', 'scaffold']))
    expect(TOOLS.filter((tool) => tool.status === 'working').map((tool) => tool.id)).toEqual(['claude-code'])
    for (const tool of TOOLS) {
      expect(isSurface(tool.surface)).toBe(true)
      expect(tool.mechanism.length).toBeGreaterThan(20)
    }
    expect(TOOLS.find((tool) => tool.id === 'claude-code-vscode')?.sellable).toBe(false)
  })
})
