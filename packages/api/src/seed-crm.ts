import { eq } from 'drizzle-orm'
import type { SwagDb } from './db.ts'
import { DEMO_ADVERTISER, DEMO_DEVELOPER } from './seed.ts'
import {
  campaigns,
  checkouts,
  contactMessages,
  crmAdvertisers,
  crmLeads,
  crmNotes,
  crmTags,
  impressions,
  installs,
  ledger,
  payouts,
  privacyRequests,
  users,
} from './schema.ts'

const NORTHWIND = '00000000-0000-4000-8000-0000000000c1'
const MATEO = '00000000-0000-4000-8000-00000000f201'
const PRIYA = '00000000-0000-4000-8000-00000000f202'
const JONAH = '00000000-0000-4000-8000-00000000f203'
const MINA = '00000000-0000-4000-8000-00000000f211'
const OWEN = '00000000-0000-4000-8000-00000000f212'
const SARA = '00000000-0000-4000-8000-00000000f213'
const THEO = '00000000-0000-4000-8000-00000000f214'
const YARA = '00000000-0000-4000-8000-00000000f215'

/** Local `pnpm dev`, and a Vercel preview if one is configured. The Worker sets SWAG_ENV=production and never receives this fixture. */
export function crmSeedAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SWAG_ENV === 'production' || env.VERCEL_ENV === 'production') return false
  if (env.VERCEL && env.VERCEL_ENV !== 'preview') return false
  return true
}

export async function seedCrmDemo(db: SwagDb, now: number, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!crmSeedAllowed(env)) {
    throw new Error('Refusing to seed CRM demo data in production. CRM fixtures are local and preview only.')
  }
  const [marker] = await db.select({ id: users.id }).from(users).where(eq(users.id, MATEO))
  if (marker) return

  const day = 86_400_000
  await db.insert(users).values([
    person(MATEO, 'mateo.silva@dev.swagmoney.test', 'Mateo Silva', 'developer', 'BR', 'password', 'stripe', 'active', now - 6 * day),
    person(PRIYA, 'priya.shah@dev.swagmoney.test', 'Priya Shah', 'developer', 'IN', 'magic_link', 'upi', 'suspended', now - 12 * day),
    person(JONAH, 'jonah.berg@dev.swagmoney.test', 'Jonah Berg', 'developer', 'SE', 'password', 'solana', 'active', now - 2 * day),
    person(MINA, 'mina.chen@ads.swagmoney.test', 'Mina Chen', 'advertiser', 'SG', 'magic_link', '', 'active', now - 20 * day),
    person(OWEN, 'owen.brooks@ads.swagmoney.test', 'Owen Brooks', 'advertiser', 'DE', 'password', '', 'active', now - 9 * day),
    person(SARA, 'sara.iqbal@ads.swagmoney.test', 'Sara Iqbal', 'advertiser', 'AE', 'password', '', 'active', now - 4 * day),
    person(THEO, 'theo.marin@ads.swagmoney.test', 'Theo Marin', 'advertiser', 'FR', 'magic_link', '', 'active', now - 28 * day),
    person(YARA, 'yara.hassan@ads.swagmoney.test', 'Yara Hassan', 'advertiser', 'KE', 'password', '', 'active', now - day),
  ])

  const [ada] = await db.select({ id: users.id }).from(users).where(eq(users.id, DEMO_DEVELOPER.id))
  const [lin] = await db.select({ id: users.id }).from(users).where(eq(users.id, DEMO_ADVERTISER.id))
  if (ada) {
    await db
      .update(users)
      .set({ residenceCountry: 'NG', payoutPreference: 'upi', signupMethod: 'demo', accountStatus: 'active' })
      .where(eq(users.id, DEMO_DEVELOPER.id))
  }
  if (lin) {
    await db
      .update(users)
      .set({ residenceCountry: 'US', signupMethod: 'demo', accountStatus: 'active' })
      .where(eq(users.id, DEMO_ADVERTISER.id))
  }

  const mateoInstall = '00000000-0000-4000-8000-00000000f301'
  const priyaInstall = '00000000-0000-4000-8000-00000000f302'
  const jonahInstall = '00000000-0000-4000-8000-00000000f303'
  await db.insert(installs).values([
    { id: mateoInstall, userId: MATEO, label: 'vscode-laptop', devicePublicKey: 'demo-public-key-mateo-not-a-secret', createdAtMs: now - 5 * day },
    { id: priyaInstall, userId: PRIYA, label: 'claude-code', devicePublicKey: 'demo-public-key-priya-not-a-secret', createdAtMs: now - 11 * day },
    { id: jonahInstall, userId: JONAH, label: 'claude-code', devicePublicKey: 'demo-public-key-jonah-not-a-secret', createdAtMs: now - day },
  ])

  const [northwind] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, NORTHWIND))
  if (northwind) {
    const impressionRows = []
    const ledgerRows = []
    for (let i = 0; i < 4; i++) {
      const id = `00000000-0000-4000-8000-00000000f4${i.toString(16).padStart(2, '0')}`
      const servedAtMs = now - (4 - i) * 3_600_000
      impressionRows.push(impression(id, MATEO, mateoInstall, 'vscode', 'verified', servedAtMs, null))
      ledgerRows.push({
        id: `00000000-0000-4000-8000-00000000f5${i.toString(16).padStart(2, '0')}`,
        userId: MATEO,
        impressionId: id,
        payoutId: null,
        kind: 'earn',
        amountCents: 25,
        createdAtMs: servedAtMs,
      })
    }
    const fraud: Array<[string, string, string]> = [
      ['f410', 'view_too_short', 'rejected'],
      ['f411', 'view_too_short', 'rejected'],
      ['f412', 'bad_proof', 'rejected'],
      ['f413', 'bad_device_signature', 'rejected'],
      ['f414', 'expired', 'expired'],
    ]
    fraud.forEach(([suffix, reason, status], index) => {
      impressionRows.push(
        impression(
          `00000000-0000-4000-8000-00000000${suffix}`,
          PRIYA,
          priyaInstall,
          index % 2 === 0 ? 'claude-code' : 'vscode',
          status,
          now - (index + 1) * 3_600_000,
          reason,
        ),
      )
    })
    for (let i = 0; i < 8; i++) {
      const id = `00000000-0000-4000-8000-00000000f6${i.toString(16).padStart(2, '0')}`
      const servedAtMs = now - (8 - i) * 3_600_000
      impressionRows.push(impression(id, JONAH, jonahInstall, 'claude-code', 'verified', servedAtMs, null))
      ledgerRows.push({
        id: `00000000-0000-4000-8000-00000000f7${i.toString(16).padStart(2, '0')}`,
        userId: JONAH,
        impressionId: id,
        payoutId: null,
        kind: 'earn',
        amountCents: 25,
        createdAtMs: servedAtMs,
      })
    }
    await db.insert(impressions).values(impressionRows)
    await db.insert(ledger).values(ledgerRows)
  }

  const saraCampaign = '00000000-0000-4000-8000-00000000f801'
  await db.insert(campaigns).values({
    id: saraCampaign,
    advertiserId: SARA,
    name: 'Lumen traces',
    advertiserName: 'Lumen',
    status: 'paused',
    adText: 'Lumen: trace every agent step without leaving the editor',
    maxBidCents: 40,
    budgetCents: 4_000,
    spentCents: 800,
    reservedCents: 0,
    surfaces: JSON.stringify(['claude-code']),
    placement: 'terminal',
    countries: JSON.stringify(['AE', 'IN']),
    destinationUrl: 'https://lumen.example/traces',
    impressionCredits: 2_000,
    companyName: 'Lumen',
    pace: 'medium',
    createdAtMs: now - 3 * day,
  })
  const checkoutId = '00000000-0000-4000-8000-00000000f802'
  await db.insert(checkouts).values({
    id: checkoutId,
    advertiserId: SARA,
    campaignId: saraCampaign,
    blocks: 2,
    bidPerBlockCents: 200,
    countrySurchargeCents: 150,
    totalCents: 550,
    status: 'paid',
    provider: 'mock_card',
    mode: 'mock',
    pace: 'medium',
    emailInvoice: 1,
    createdAtMs: now - 3 * day,
  })

  await db.insert(crmAdvertisers).values([
    ...(lin
      ? [{ userId: DEMO_ADVERTISER.id, pipelineStage: 'active', owner: 'ops@swagmoney.test', followUpAtMs: now + 5 * day, company: 'Northwind' }]
      : []),
    { userId: MINA, pipelineStage: 'contacted', owner: 'ops@swagmoney.test', followUpAtMs: now + 2 * day, company: 'Helio Labs' },
    { userId: OWEN, pipelineStage: 'onboarding', owner: 'mina.chen@ads.swagmoney.test', followUpAtMs: now + 1 * day, company: 'Packet Works' },
    { userId: SARA, pipelineStage: 'paused', owner: 'ops@swagmoney.test', followUpAtMs: now - day, company: 'Lumen' },
    { userId: THEO, pipelineStage: 'churned', owner: '', followUpAtMs: null, company: 'Drift' },
    { userId: YARA, pipelineStage: 'lead', owner: '', followUpAtMs: now + 7 * day, company: 'Kite' },
  ])

  const contactId = '00000000-0000-4000-8000-00000000f901'
  const privacyId = '00000000-0000-4000-8000-00000000f902'
  await db.insert(contactMessages).values({
    id: contactId,
    name: 'Nia Okonkwo',
    email: 'nia.okonkwo@press.example',
    topic: 'press',
    message: 'Can I get the fraud-check description for a short piece?',
    createdAtMs: now - 2 * 3_600_000,
  })
  await db.insert(privacyRequests).values({
    id: privacyId,
    userId: null,
    kind: 'access',
    email: 'privacy.ada@example.test',
    region: 'CA',
    details: 'Please export the account data.',
    authorizedAgent: 0,
    verification: 'email_pending',
    createdAtMs: now - 5 * 3_600_000,
  })
  await db.insert(crmLeads).values([
    lead('00000000-0000-4000-8000-00000000fa01', 'contact', contactId, 'Nia Okonkwo', 'nia.okonkwo@press.example', '', '', 'press: Can I get the fraud-check description for a short piece?', 'new', now - 2 * 3_600_000),
    lead('00000000-0000-4000-8000-00000000fa02', 'privacy', privacyId, 'privacy.ada@example.test', 'privacy.ada@example.test', '', 'CA', 'access: Please export the account data.', 'reviewed', now - 5 * 3_600_000),
    lead('00000000-0000-4000-8000-00000000fa03', 'advertiser', checkoutId, 'Sara Iqbal', 'sara.iqbal@ads.swagmoney.test', 'Lumen', 'AE', 'Bought 2 impression blocks', 'replied', now - 3 * day),
    lead('00000000-0000-4000-8000-00000000fa04', 'contact', '00000000-0000-4000-8000-00000000fa04', 'Spam Bot', 'spam.bot@example.test', '', '', 'security: buy followers', 'spam', now - 8 * day),
  ])

  const jonahPayout = '00000000-0000-4000-8000-00000000fb01'
  const priyaPayout = '00000000-0000-4000-8000-00000000fb02'
  const adaPayout = '00000000-0000-4000-8000-00000000fb03'
  await db.insert(payouts).values([
    {
      id: jonahPayout,
      userId: JONAH,
      provider: 'solana',
      mode: 'mock',
      amountCents: 200,
      creditBonusCents: 0,
      creditValueCents: 200,
      destination: 'So11111111111111111111111111111111111111112',
      externalId: 'mock_solana_demo',
      detail: 'Mock Solana transfer. Nothing was broadcast.',
      status: 'completed',
      reviewedAtMs: now - 3_600_000,
      reviewedBy: DEMO_DEVELOPER.email,
      createdAtMs: now - 2 * 3_600_000,
    },
    {
      id: priyaPayout,
      userId: PRIYA,
      provider: 'upi',
      mode: 'mock',
      amountCents: 1_000,
      creditBonusCents: 0,
      creditValueCents: 1_000,
      destination: 'priya.shah@okhdfcbank',
      externalId: 'mock_upi_demo',
      detail: 'Mock RazorpayX UPI payout. No network call was made.',
      status: 'pending',
      reviewedAtMs: null,
      reviewedBy: '',
      createdAtMs: now - 4 * 3_600_000,
    },
    ...(ada
      ? [{
      id: adaPayout,
      userId: DEMO_DEVELOPER.id,
      provider: 'upi',
      mode: 'mock',
      amountCents: 400,
      creditBonusCents: 0,
      creditValueCents: 400,
      destination: 'ada.okafor@okaxis',
      externalId: 'mock_upi_ada',
      detail: 'Mock RazorpayX UPI payout. No network call was made.',
      status: 'pending',
      reviewedAtMs: null,
      reviewedBy: '',
      createdAtMs: now - 3_600_000,
    }]
      : []),
  ])
  await db.insert(ledger).values({
    id: '00000000-0000-4000-8000-00000000fb11',
    userId: JONAH,
    impressionId: null,
    payoutId: jonahPayout,
    kind: 'payout',
    amountCents: -200,
    createdAtMs: now - 2 * 3_600_000,
  })

  await db.insert(crmNotes).values([
    {
      id: '00000000-0000-4000-8000-00000000fc01',
      subjectType: 'developer',
      subjectId: PRIYA,
      authorId: ada ? DEMO_DEVELOPER.id : PRIYA,
      body: 'Render challenges failed three ways. Hold payout until the install is checked.',
      createdAtMs: now - 3 * 3_600_000,
    },
    ...(lin
      ? [{
          id: '00000000-0000-4000-8000-00000000fc02',
          subjectType: 'advertiser',
          subjectId: DEMO_ADVERTISER.id,
          authorId: ada ? DEMO_DEVELOPER.id : MINA,
          body: 'Northwind is the house demo account. Do not email them.',
          createdAtMs: now - day,
        }]
      : []),
  ])
  await db.insert(crmTags).values([
    { id: '00000000-0000-4000-8000-00000000fd01', subjectType: 'developer', subjectId: PRIYA, tag: 'fraud-review', authorId: DEMO_DEVELOPER.id, createdAtMs: now - 3 * 3_600_000 },
    { id: '00000000-0000-4000-8000-00000000fd02', subjectType: 'advertiser', subjectId: SARA, tag: 'follow-up', authorId: DEMO_DEVELOPER.id, createdAtMs: now - day },
  ])
}

function person(
  id: string,
  email: string,
  name: string,
  role: string,
  country: string,
  signupMethod: string,
  payoutPreference: string,
  accountStatus: string,
  createdAtMs: number,
) {
  return {
    id,
    email,
    name,
    role,
    residenceCountry: country,
    signupMethod,
    payoutPreference,
    accountStatus,
    setupComplete: 1,
    createdAtMs,
  }
}

function impression(
  id: string,
  developerId: string,
  installId: string,
  surface: string,
  status: string,
  servedAtMs: number,
  lastError: string | null,
) {
  return {
    id,
    campaignId: NORTHWIND,
    developerId,
    installId,
    surface,
    nonce: id.replace(/-/g, '').slice(0, 32),
    adText: 'Northwind CI: ephemeral environments for every PR',
    priceCents: 51,
    developerShareCents: 25,
    platformShareCents: 26,
    status,
    servedAtMs,
    verifiedAtMs: status === 'verified' ? servedAtMs + 5_000 : null,
    lastError,
  }
}

function lead(
  id: string,
  kind: string,
  sourceId: string,
  name: string,
  email: string,
  company: string,
  country: string,
  summary: string,
  status: string,
  createdAtMs: number,
) {
  return {
    id,
    kind,
    sourceId,
    name,
    email,
    company,
    country,
    summary,
    status,
    createdAtMs,
    updatedAtMs: createdAtMs,
  }
}
