import { eq } from 'drizzle-orm'
import { bytesToB64Url, generateEd25519KeyPair, randomHex } from '@swag-money/crypto'
import { runEnglishAuction, splitRevenue, type AuctionCandidate } from '@swag-money/shared'
import { isHosted } from './config.ts'
import type { SwagDb } from './db.ts'
import { hashPassword } from './passwords.ts'
import { campaigns, impressions, installs, ledger, users } from './schema.ts'

/** Local demo fixture. Not a production credential. */
export const DEMO_PASSWORD = 'swag-demo'

export const DEMO_DEVELOPER = {
  id: '00000000-0000-4000-8000-0000000000a1',
  email: 'ada@dev.swagmoney.test',
  name: 'Ada Okafor',
}

export const DEMO_ADVERTISER = {
  id: '00000000-0000-4000-8000-0000000000b1',
  email: 'lin@ads.swagmoney.test',
  name: 'Lin Zhao',
}

const NORTHWIND = '00000000-0000-4000-8000-0000000000c1'
const HELIO = '00000000-0000-4000-8000-0000000000c2'
const PACKET = '00000000-0000-4000-8000-0000000000c3'
const SEED_INSTALL = '00000000-0000-4000-8000-0000000000d1'

function demoId(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}

export async function ensureDemoPasswords(db: SwagDb, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (isHosted(env)) {
    throw new Error('Refusing to write demo passwords in production. Demo users are a local development fixture.')
  }
  const hash = hashPassword(DEMO_PASSWORD)
  for (const person of [DEMO_DEVELOPER, DEMO_ADVERTISER]) {
    const [user] = await db.select().from(users).where(eq(users.id, person.id))
    if (user && !user.passwordHash) {
      await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id))
    }
  }
}

export async function seedIfEmpty(db: SwagDb, now: number, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (isHosted(env)) {
    throw new Error('Refusing to seed demo users in production. seedIfEmpty is a local development command.')
  }
  const existing = await db.select({ id: users.id }).from(users).limit(1)
  if (existing.length > 0) return

  await db.insert(users).values([
    { id: DEMO_DEVELOPER.id, email: DEMO_DEVELOPER.email, name: DEMO_DEVELOPER.name, role: 'developer', createdAtMs: now - 86_400_000 },
    { id: DEMO_ADVERTISER.id, email: DEMO_ADVERTISER.email, name: DEMO_ADVERTISER.name, role: 'advertiser', createdAtMs: now - 86_400_000 },
  ])

  const created = {
    northwind: now - 3 * 86_400_000,
    helio: now - 2 * 86_400_000,
    packet: now - 86_400_000,
  }
  const surfaces = JSON.stringify(['claude-code', 'vscode', 'browser'])
  await db.insert(campaigns).values([
    {
      id: NORTHWIND,
      advertiserId: DEMO_ADVERTISER.id,
      name: 'Northwind CI',
      advertiserName: 'Northwind',
      status: 'active',
      adText: 'Northwind CI: ephemeral environments for every PR',
      maxBidCents: 80,
      budgetCents: 10_000,
      spentCents: 0,
      reservedCents: 0,
      surfaces,
      createdAtMs: created.northwind,
    },
    {
      id: HELIO,
      advertiserId: DEMO_ADVERTISER.id,
      name: 'Helio',
      advertiserName: 'Helio',
      status: 'active',
      adText: 'Helio: evals and traces for agents in production',
      maxBidCents: 50,
      budgetCents: 8_000,
      spentCents: 0,
      reservedCents: 0,
      surfaces,
      createdAtMs: created.helio,
    },
    {
      id: PACKET,
      advertiserId: DEMO_ADVERTISER.id,
      name: 'Packet Garden',
      advertiserName: 'Packet Garden',
      status: 'paused',
      adText: 'Packet Garden: regional CDN for build artifacts',
      maxBidCents: 40,
      budgetCents: 5_000,
      spentCents: 0,
      reservedCents: 0,
      surfaces: JSON.stringify(['claude-code', 'jetbrains']),
      createdAtMs: created.packet,
    },
  ])

  const candidates: AuctionCandidate[] = [
    {
      campaignId: NORTHWIND,
      maxBidCents: 80,
      budgetRemainingCents: 10_000,
      createdAtMs: created.northwind,
      surfaces: ['claude-code', 'vscode', 'browser'],
    },
    {
      campaignId: HELIO,
      maxBidCents: 50,
      budgetRemainingCents: 8_000,
      createdAtMs: created.helio,
      surfaces: ['claude-code', 'vscode', 'browser'],
    },
  ]
  const winner = runEnglishAuction(candidates, 'claude-code')
  if (!winner || winner.campaignId !== NORTHWIND || winner.priceCents !== 51) {
    throw new Error(`Seed auction drifted from the documented 51 cent clearing price: ${JSON.stringify(winner)}`)
  }
  const split = splitRevenue(winner.priceCents)

  const device = generateEd25519KeyPair()
  await db.insert(installs).values({
    id: SEED_INSTALL,
    userId: DEMO_DEVELOPER.id,
    label: 'seed-cli',
    devicePublicKey: bytesToB64Url(device.publicKey),
    createdAtMs: now - 86_400_000,
  })

  const verifiedCount = 48
  const impressionRows = []
  const ledgerRows = []
  for (let i = 0; i < verifiedCount; i++) {
    const surface = i % 11 === 0 ? 'browser' : i % 4 === 0 ? 'vscode' : 'claude-code'
    const servedAtMs = now - (verifiedCount - i + 3) * 60_000
    const id = demoId(i + 1)
    impressionRows.push({
      id,
      campaignId: NORTHWIND,
      developerId: DEMO_DEVELOPER.id,
      installId: SEED_INSTALL,
      surface,
      nonce: randomHex(16),
      adText: 'Northwind CI: ephemeral environments for every PR',
      priceCents: winner.priceCents,
      developerShareCents: split.developerCents,
      platformShareCents: split.platformCents,
      status: 'verified',
      servedAtMs,
      verifiedAtMs: servedAtMs + 5_000,
      lastError: null,
    })
    ledgerRows.push({
      id: demoId(1_000 + i),
      userId: DEMO_DEVELOPER.id,
      impressionId: id,
      payoutId: null,
      kind: 'earn',
      amountCents: split.developerCents,
      createdAtMs: servedAtMs + 5_000,
    })
  }

  impressionRows.push(
    {
      id: demoId(90),
      campaignId: NORTHWIND,
      developerId: DEMO_DEVELOPER.id,
      installId: SEED_INSTALL,
      surface: 'claude-code',
      nonce: randomHex(16),
      adText: 'Northwind CI: ephemeral environments for every PR',
      priceCents: winner.priceCents,
      developerShareCents: split.developerCents,
      platformShareCents: split.platformCents,
      status: 'rejected',
      servedAtMs: now - 30_000,
      verifiedAtMs: null,
      lastError: 'view_too_short',
    },
    {
      id: demoId(91),
      campaignId: NORTHWIND,
      developerId: DEMO_DEVELOPER.id,
      installId: SEED_INSTALL,
      surface: 'vscode',
      nonce: randomHex(16),
      adText: 'Northwind CI: ephemeral environments for every PR',
      priceCents: winner.priceCents,
      developerShareCents: split.developerCents,
      platformShareCents: split.platformCents,
      status: 'rejected',
      servedAtMs: now - 20_000,
      verifiedAtMs: null,
      lastError: 'bad_proof',
    },
    {
      id: demoId(92),
      campaignId: NORTHWIND,
      developerId: DEMO_DEVELOPER.id,
      installId: SEED_INSTALL,
      surface: 'claude-code',
      nonce: randomHex(16),
      adText: 'Northwind CI: ephemeral environments for every PR',
      priceCents: winner.priceCents,
      developerShareCents: split.developerCents,
      platformShareCents: split.platformCents,
      status: 'served',
      servedAtMs: now - 4_000,
      verifiedAtMs: null,
      lastError: null,
    },
  )

  await db.insert(impressions).values(impressionRows)
  await db.insert(ledger).values(ledgerRows)
  await db
    .update(campaigns)
    .set({
      spentCents: verifiedCount * winner.priceCents,
      reservedCents: winner.priceCents,
    })
    .where(eq(campaigns.id, NORTHWIND))
}
