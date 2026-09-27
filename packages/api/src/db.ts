import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from './schema.ts'

export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL,
  password_hash text NOT NULL DEFAULT '',
  created_at_ms bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS installs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  label text NOT NULL,
  device_public_key text NOT NULL,
  created_at_ms bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS campaigns (
  id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES users(id),
  name text NOT NULL,
  advertiser_name text NOT NULL,
  status text NOT NULL,
  ad_text text NOT NULL,
  max_bid_cents integer NOT NULL,
  budget_cents integer NOT NULL,
  spent_cents integer NOT NULL,
  reserved_cents integer NOT NULL,
  surfaces text NOT NULL,
  placement text NOT NULL DEFAULT 'any',
  countries text NOT NULL DEFAULT '[]',
  destination_url text NOT NULL DEFAULT '',
  impression_credits integer NOT NULL DEFAULT 0,
  created_at_ms bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS impressions (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  developer_id text NOT NULL REFERENCES users(id),
  install_id text NOT NULL REFERENCES installs(id),
  surface text NOT NULL,
  nonce text NOT NULL,
  ad_text text NOT NULL,
  price_cents integer NOT NULL,
  developer_share_cents integer NOT NULL,
  platform_share_cents integer NOT NULL,
  status text NOT NULL,
  served_at_ms bigint NOT NULL,
  verified_at_ms bigint,
  last_error text
);
CREATE TABLE IF NOT EXISTS ledger (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  impression_id text,
  payout_id text,
  kind text NOT NULL,
  amount_cents integer NOT NULL,
  created_at_ms bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS payouts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  provider text NOT NULL,
  mode text NOT NULL,
  amount_cents integer NOT NULL,
  credit_bonus_cents integer NOT NULL,
  credit_value_cents integer NOT NULL,
  destination text NOT NULL,
  external_id text NOT NULL,
  detail text NOT NULL,
  status text NOT NULL,
  created_at_ms bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES users(id),
  prefix text NOT NULL,
  key_hash text NOT NULL,
  label text NOT NULL,
  created_at_ms bigint NOT NULL,
  revoked_at_ms bigint
);
CREATE TABLE IF NOT EXISTS checkouts (
  id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES users(id),
  campaign_id text NOT NULL REFERENCES campaigns(id),
  blocks integer NOT NULL,
  bid_per_block_cents integer NOT NULL,
  country_surcharge_cents integer NOT NULL,
  total_cents integer NOT NULL,
  status text NOT NULL,
  provider text NOT NULL,
  mode text NOT NULL,
  created_at_ms bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS impressions_developer_idx ON impressions (developer_id, served_at_ms);
CREATE INDEX IF NOT EXISTS ledger_user_idx ON ledger (user_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'any';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS countries text NOT NULL DEFAULT '[]';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS destination_url text NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS impression_credits integer NOT NULL DEFAULT 0;
`

export type SwagDb = ReturnType<typeof drizzle<typeof schema>>

export async function openDatabase(dataDir?: string): Promise<{ db: SwagDb; close: () => Promise<void> }> {
  const client = new PGlite(dataDir)
  await client.exec(MIGRATION_SQL)
  const db = drizzle(client, { schema })
  return {
    db,
    async close() {
      await client.close()
    },
  }
}
