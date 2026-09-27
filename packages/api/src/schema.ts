import { bigint, integer, pgTable, text } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  passwordHash: text('password_hash').notNull().default(''),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})

export const installs = pgTable('installs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  label: text('label').notNull(),
  devicePublicKey: text('device_public_key').notNull(),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})

export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  advertiserId: text('advertiser_id').notNull(),
  name: text('name').notNull(),
  advertiserName: text('advertiser_name').notNull(),
  status: text('status').notNull(),
  adText: text('ad_text').notNull(),
  maxBidCents: integer('max_bid_cents').notNull(),
  budgetCents: integer('budget_cents').notNull(),
  spentCents: integer('spent_cents').notNull(),
  reservedCents: integer('reserved_cents').notNull(),
  surfaces: text('surfaces').notNull(),
  placement: text('placement').notNull().default('any'),
  countries: text('countries').notNull().default('[]'),
  destinationUrl: text('destination_url').notNull().default(''),
  impressionCredits: integer('impression_credits').notNull().default(0),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  advertiserId: text('advertiser_id').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  label: text('label').notNull(),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
  revokedAtMs: bigint('revoked_at_ms', { mode: 'number' }),
})

export const checkouts = pgTable('checkouts', {
  id: text('id').primaryKey(),
  advertiserId: text('advertiser_id').notNull(),
  campaignId: text('campaign_id').notNull(),
  blocks: integer('blocks').notNull(),
  bidPerBlockCents: integer('bid_per_block_cents').notNull(),
  countrySurchargeCents: integer('country_surcharge_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  status: text('status').notNull(),
  provider: text('provider').notNull(),
  mode: text('mode').notNull(),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})

export const impressions = pgTable('impressions', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  developerId: text('developer_id').notNull(),
  installId: text('install_id').notNull(),
  surface: text('surface').notNull(),
  nonce: text('nonce').notNull(),
  adText: text('ad_text').notNull(),
  priceCents: integer('price_cents').notNull(),
  developerShareCents: integer('developer_share_cents').notNull(),
  platformShareCents: integer('platform_share_cents').notNull(),
  status: text('status').notNull(),
  servedAtMs: bigint('served_at_ms', { mode: 'number' }).notNull(),
  verifiedAtMs: bigint('verified_at_ms', { mode: 'number' }),
  lastError: text('last_error'),
})

export const ledger = pgTable('ledger', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  impressionId: text('impression_id'),
  payoutId: text('payout_id'),
  kind: text('kind').notNull(),
  amountCents: integer('amount_cents').notNull(),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})

export const payouts = pgTable('payouts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  mode: text('mode').notNull(),
  amountCents: integer('amount_cents').notNull(),
  creditBonusCents: integer('credit_bonus_cents').notNull(),
  creditValueCents: integer('credit_value_cents').notNull(),
  destination: text('destination').notNull(),
  externalId: text('external_id').notNull(),
  detail: text('detail').notNull(),
  status: text('status').notNull(),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})
