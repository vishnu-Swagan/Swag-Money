import { randomHex } from '@swag-money/crypto'
import { apiCreditValueCents } from '@swag-money/shared'

export type PayoutProviderId = 'stripe_connect' | 'solana' | 'lightning' | 'api_credits'
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
}

const DESTINATIONS: Record<PayoutProviderId, RegExp> = {
  stripe_connect: /^acct_[A-Za-z0-9]{8,}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  lightning: /^(lnbc|lntb|lnbcrt)[0-9a-z]+$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  api_credits: /^(anthropic|openai|oss)$/,
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
      return {
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
      }
    }
    case 'solana': {
      const configured = Boolean(env.solanaRpcUrl && env.solanaPayoutSecret)
      const mode: PayoutMode = configured ? 'sandbox' : 'mock'
      return {
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
      }
    }
    case 'lightning': {
      const configured = Boolean(env.lightningNodeUrl && env.lightningMacaroon)
      const mode: PayoutMode = configured ? 'sandbox' : 'mock'
      return {
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
      }
    }
    case 'api_credits': {
      const key =
        request.destination === 'anthropic'
          ? env.anthropicApiKey
          : request.destination === 'openai'
            ? env.openaiApiKey
            : undefined
      const mode: PayoutMode = key ? 'sandbox' : 'mock'
      return {
        provider: request.provider,
        mode,
        externalId: id(mode === 'sandbox' ? 'sandbox_credits' : 'mock_credits'),
        amountCents: request.amountCents,
        creditBonusCents: credits.bonusCents,
        creditValueCents: credits.creditValueCents,
        detail: `${mode === 'sandbox' ? 'Sandbox' : 'Mock'} ${request.destination} API credits. Withdrawable earnings of ${request.amountCents} cents convert to ${credits.creditValueCents} cents of credit, including a ${credits.bonusCents} cent (10%) bonus. No provider API was called.`,
      }
    }
    default: {
      const neverProvider: never = request.provider
      throw new PayoutProviderError('bad_provider', `Unknown provider ${neverProvider}`)
    }
  }
}
