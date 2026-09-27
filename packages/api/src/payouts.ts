import { randomHex } from '@swag-money/crypto'
import { apiCreditValueCents } from '@swag-money/shared'

export type PayoutProviderId = 'stripe_connect' | 'solana' | 'lightning' | 'api_credits' | 'upi'
export type PayoutMode = 'mock' | 'sandbox'

export class PayoutProviderError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PayoutProviderError'
    this.code = code
  }
}

export type PayoutEnv = {
  stripeSecretKey?: string
  solanaRpcUrl?: string
  solanaPayoutSecret?: string
  lightningNodeUrl?: string
  lightningMacaroon?: string
  openaiApiKey?: string
  anthropicApiKey?: string
  razorpayxKeyId?: string
  razorpayxKeySecret?: string
}

export type PayoutRequest = {
  provider: PayoutProviderId
  amountCents: number
  destination: string
}

export type PayoutReceipt = {
  provider: PayoutProviderId
  mode: PayoutMode
  externalId: string
  amountCents: number
  creditBonusCents: number
  creditValueCents: number
  detail: string
  /** Ledger debit is immediate once the $10 balance is available. */
  schedule: 'on_demand'
}

const DESTINATIONS: Record<PayoutProviderId, RegExp> = {
  stripe_connect: /^acct_[A-Za-z0-9]{8,}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  lightning: /^(lnbc|lntb|lnbcrt)[0-9a-z]+$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  api_credits: /^(anthropic|openai|oss)$/,
  upi: /^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$/,
}

export function assertDestination(provider: PayoutProviderId, destination: string): void {
  const pattern = DESTINATIONS[provider]
  if (!pattern.test(destination)) {
    throw new PayoutProviderError('bad_destination', `Destination is not valid for ${provider}`)
  }
}

function id(prefix: string): string {
  return `${prefix}_${randomHex(8)}`
}

function receipt(partial: Omit<PayoutReceipt, 'schedule'>): PayoutReceipt {
  return { ...partial, schedule: 'on_demand' }
}

/**
 * Payout providers. Stripe, Solana, and Lightning never leave this process:
 * with no credentials the receipt is mock; with test credentials it is sandbox
 * and describes the call that a production adapter would make. Live Stripe
 * secrets are refused. API-credit bonus math is applied locally either way.
 */
export function settlePayout(request: PayoutRequest, env: PayoutEnv): PayoutReceipt {
  assertDestination(request.provider, request.destination)
  const credits =
    request.provider === 'api_credits'
      ? apiCreditValueCents(request.amountCents)
      : { bonusCents: 0, creditValueCents: request.amountCents }

  switch (request.provider) {
    case 'stripe_connect': {
      const key = env.stripeSecretKey ?? ''
      if (key.startsWith('sk_live_')) {
        throw new PayoutProviderError(
          'live_refused',
          'Refusing a live Stripe secret. This build only records sandbox or mock Stripe Connect transfers.',
        )
      }
      const mode: PayoutMode = key.startsWith('sk_test_') ? 'sandbox' : 'mock'
      return receipt({
        provider: request.provider,
        mode,
        externalId: id(mode === 'sandbox' ? 'sandbox_stripe' : 'mock_stripe'),
        amountCents: request.amountCents,
        creditBonusCents: 0,
        creditValueCents: request.amountCents,
        detail:
          mode === 'sandbox'
            ? `Sandbox Stripe Connect transfer of ${request.amountCents} cents to ${request.destination} was recorded and not sent to the Stripe API.`
            : `Mock Stripe Connect transfer to ${request.destination}. Set STRIPE_SECRET_KEY to an sk_test_ key for sandbox mode. No network call was made.`,
      })
    }
    case 'solana': {
      const configured = Boolean(env.solanaRpcUrl && env.solanaPayoutSecret)
      const mode: PayoutMode = configured ? 'sandbox' : 'mock'
      return receipt({
        provider: request.provider,
        mode,
        externalId: id(mode === 'sandbox' ? 'sandbox_solana' : 'mock_solana'),
        amountCents: request.amountCents,
        creditBonusCents: 0,
        creditValueCents: request.amountCents,
        detail:
          mode === 'sandbox'
            ? `Sandbox Solana USDC transfer to ${request.destination} was described and not broadcast.`
            : `Mock Solana transfer to ${request.destination}. Set SOLANA_RPC_URL and SOLANA_PAYOUT_SECRET_KEY to select sandbox mode. Nothing was broadcast.`,
      })
    }
    case 'lightning': {
      const configured = Boolean(env.lightningNodeUrl && env.lightningMacaroon)
      const mode: PayoutMode = configured ? 'sandbox' : 'mock'
      return receipt({
        provider: request.provider,
        mode,
        externalId: id(mode === 'sandbox' ? 'sandbox_ln' : 'mock_ln'),
        amountCents: request.amountCents,
        creditBonusCents: 0,
        creditValueCents: request.amountCents,
        detail:
          mode === 'sandbox'
            ? `Sandbox Lightning payment to ${request.destination} was recorded and not sent to a node.`
            : `Mock Lightning payment to ${request.destination}. Set LIGHTNING_NODE_URL and LIGHTNING_MACAROON for sandbox mode. No invoice was paid.`,
      })
    }
    case 'api_credits': {
      const key =
        request.destination === 'anthropic'
          ? env.anthropicApiKey
          : request.destination === 'openai'
            ? env.openaiApiKey
            : undefined
      const mode: PayoutMode = key ? 'sandbox' : 'mock'
      return receipt({
        provider: request.provider,
        mode,
        externalId: id(mode === 'sandbox' ? 'sandbox_credits' : 'mock_credits'),
        amountCents: request.amountCents,
        creditBonusCents: credits.bonusCents,
        creditValueCents: credits.creditValueCents,
        detail: `${mode === 'sandbox' ? 'Sandbox' : 'Mock'} ${request.destination} API credits. Withdrawable earnings of ${request.amountCents} cents convert to ${credits.creditValueCents} cents of credit, including a ${credits.bonusCents} cent (10%) bonus. No provider API was called.`,
      })
    }
    case 'upi': {
      const key = env.razorpayxKeyId ?? ''
      if (key.startsWith('rzp_live_')) {
        throw new PayoutProviderError(
          'live_refused',
          'Refusing a live RazorpayX key. This build only records sandbox or mock UPI payouts.',
        )
      }
      const mode: PayoutMode = key.startsWith('rzp_test_') && env.razorpayxKeySecret ? 'sandbox' : 'mock'
      return receipt({
        provider: request.provider,
        mode,
        externalId: id(mode === 'sandbox' ? 'sandbox_upi' : 'mock_upi'),
        amountCents: request.amountCents,
        creditBonusCents: 0,
        creditValueCents: request.amountCents,
        detail:
          mode === 'sandbox'
            ? `Sandbox RazorpayX UPI payout of ${request.amountCents} cents to ${request.destination} was recorded and not sent. On demand, not a two-week batch.`
            : `Mock RazorpayX UPI payout to ${request.destination}. Set RAZORPAYX_KEY_ID to an rzp_test_ key and RAZORPAYX_KEY_SECRET for sandbox mode. No network call was made. On demand, not a two-week batch.`,
      })
    }
    default: {
      const neverProvider: never = request.provider
      throw new PayoutProviderError('bad_provider', `Unknown provider ${neverProvider}`)
    }
  }
}
