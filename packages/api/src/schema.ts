import { bigint, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  passwordHash: text('password_hash').notNull().default(''),
  ageConfirmed: integer('age_confirmed').notNull().default(0),
  residenceCountry: text('residence_country').notNull().default(''),
  newsOptIn: integer('news_opt_in').notNull().default(0),
  payoutPreference: text('payout_preference').notNull().default(''),
  setupComplete: integer('setup_complete').notNull().default(1),
  deletionScheduledAtMs: bigint('deletion_scheduled_at_ms', { mode: 'number' }),
  signupMethod: text('signup_method').notNull().default(''),
  accountStatus: text('account_status').notNull().default('active'),
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
  companyName: text('company_name').notNull().default(''),
  brandIcon: text('brand_icon').notNull().default(''),
  pace: text('pace').notNull().default('medium'),
  emailInvoice: integer('email_invoice').notNull().default(0),
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
  pace: text('pace').notNull().default('medium'),
  emailInvoice: integer('email_invoice').notNull().default(0),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})

export const magicLinks = pgTable('magic_links', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
  consumedAtMs: bigint('consumed_at_ms', { mode: 'number' }),
})

export const privacyRequests = pgTable('privacy_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  kind: text('kind').notNull(),
  email: text('email').notNull(),
  region: text('region').notNull().default(''),
  details: text('details').notNull().default(''),
  authorizedAgent: integer('authorized_agent').notNull().default(0),
  verification: text('verification').notNull(),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})

export const requestNonces = pgTable('request_nonces', {
  nonce: text('nonce').primaryKey(),
  installId: text('install_id').notNull(),
  seenAtMs: bigint('seen_at_ms', { mode: 'number' }).notNull(),
})

export const contactMessages = pgTable('contact_messages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  topic: text('topic').notNull(),
  message: text('message').notNull(),
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
  reviewedAtMs: bigint('reviewed_at_ms', { mode: 'number' }),
  reviewedBy: text('reviewed_by').notNull().default(''),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})

export const crmNotes = pgTable('crm_notes', {
  id: text('id').primaryKey(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  authorId: text('author_id').notNull(),
  body: text('body').notNull(),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})

export const crmTags = pgTable(
  'crm_tags',
  {
    id: text('id').primaryKey(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    tag: text('tag').notNull(),
    authorId: text('author_id').notNull(),
    createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
  },
  (table) => [uniqueIndex('crm_tags_unique_idx').on(table.subjectType, table.subjectId, table.tag)],
)

export const crmAdvertisers = pgTable('crm_advertisers', {
  userId: text('user_id').primaryKey(),
  pipelineStage: text('pipeline_stage').notNull().default('lead'),
  owner: text('owner').notNull().default(''),
  followUpAtMs: bigint('follow_up_at_ms', { mode: 'number' }),
  company: text('company').notNull().default(''),
})

export const crmLeads = pgTable(
  'crm_leads',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    sourceId: text('source_id').notNull(),
    name: text('name').notNull().default(''),
    email: text('email').notNull().default(''),
    company: text('company').notNull().default(''),
    country: text('country').notNull().default(''),
    summary: text('summary').notNull().default(''),
    status: text('status').notNull().default('new'),
    createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
    updatedAtMs: bigint('updated_at_ms', { mode: 'number' }).notNull(),
  },
  (table) => [uniqueIndex('crm_leads_source_idx').on(table.kind, table.sourceId)],
)

export const adminAuditLog = pgTable('admin_audit_log', {
  id: text('id').primaryKey(),
  actorUserId: text('actor_user_id').notNull(),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  detail: text('detail').notNull().default(''),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})

export const crmMailOutbox = pgTable('crm_mail_outbox', {
  id: text('id').primaryKey(),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  delivery: text('delivery').notNull(),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
})

export const schemaMigrations = pgTable('schema_migrations', {
  version: text('version').primaryKey(),
  appliedAtMs: bigint('applied_at_ms', { mode: 'number' }).notNull(),
})
