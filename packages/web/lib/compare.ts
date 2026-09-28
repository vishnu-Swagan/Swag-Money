export const COMPARE_NOTE =
  'Kickbacks.ai is a trademark of ShiftKeys Inc. Comparison based on public information as of September 2026. Corrections: legal@swagmoney.ai.'

export type CompareRow = {
  id: string
  topic: string
  kickbacks: string
  swag: string
  shortKickbacks: string
  shortSwag: string
  sourceLabel: string
  sourceHref: string
}

export const COMPARE_ROWS: CompareRow[] = [
  {
    id: 'coverage',
    topic: 'Coverage',
    kickbacks:
      'As of September 2026, earning is on Claude Code and the Codex VS Code panel. Terminal earning still needs the VS Code extension running. The FAQ says Codex CLI is not supported.',
    swag:
      'Twenty-seven integrations are listed. Claude Code CLI is working. Twenty-two are beta and four are scaffold (OpenCode, Kilo, Goose, JetBrains). Status is on the integrations page. We do not claim they are earning in production, and terminal earning does not require VS Code.',
    shortKickbacks: 'Claude Code and the Codex editor panel. Terminal earning needs VS Code.',
    shortSwag: '27 integrations, with working, beta, and scaffold labeled. No VS Code requirement.',
    sourceLabel: 'Kickbacks FAQ',
    sourceHref: 'https://kickbacks.ai/faq',
  },
  {
    id: 'method',
    topic: 'Integration method',
    kickbacks:
      'As of September 2026, reviews of the extension describe patches to Anthropic’s and OpenAI’s bundles, and a connect-src addition on the Claude Code webview CSP. The FAQ says a Claude Code update can break compatibility.',
    swag:
      'Official settings, hooks, and plugin APIs only. No edits to another vendor’s extension files, and no CSP changes. The browser extension keeps script-src self.',
    shortKickbacks: 'Patches vendor extension bundles and adds a connect-src on the Claude Code webview.',
    shortSwag: 'Official settings, hooks, and plugin APIs. No patching and no CSP changes.',
    sourceLabel: 'Security review, Sep 2026',
    sourceHref: 'https://go-to-agency.com/en/blog/kickbacks-ai-ads-claude-code-spinner',
  },
  {
    id: 'signing',
    topic: 'Updates and signing',
    kickbacks:
      'The 21 September 2026 package (v3.1.7) polls its update manifest about every 90 seconds. In that build a missing or bad manifest signature is logged and the update still applies, unless KICKBACKS_REQUIRE_MANIFEST_SIG=1. Earlier reviews reported an empty signing key.',
    swag:
      'The client never downloads code. Ad payloads are Ed25519-signed text. A tampered payload is rejected before it is shown.',
    shortKickbacks: 'Self-update about every 90 seconds. In v3.1.7 a bad signature is only logged unless an env var is set.',
    shortSwag: 'No downloaded code. Ed25519-signed text, rejected if tampered.',
    sourceLabel: 'v3.1.7 package',
    sourceHref: 'https://kickbacks.ai/v2-vsix',
  },
  {
    id: 'fraud',
    topic: 'Fraud',
    kickbacks:
      'The FAQ describes an impression as about 10 continuous seconds on screen, plus automated checks and human review. Hiding the window resets the clock.',
    swag:
      'The server issues a nonce. The device reads the signed line back three times across five seconds and signs that transcript. Replays, short views, and unsigned payloads pay nothing. This is not a hardware attestation.',
    shortKickbacks: 'About 10 seconds on screen, plus review.',
    shortSwag: 'Server-issued render challenge: three read-backs across five seconds.',
    sourceLabel: 'Kickbacks FAQ',
    sourceHref: 'https://kickbacks.ai/faq',
  },
  {
    id: 'privacy',
    topic: 'Privacy',
    kickbacks:
      'Opt-in Boosted Mode sends prompts, replies, session titles, and repo names to Kickbacks servers, and a cleaned copy to ad partners. It is not offered in the EEA, the UK, or Switzerland. Private Mode is the alternative.',
    swag:
      'Swag-Money never reads or sends prompts or code. There is no boosted mode. The same rules apply in every region. Hook scripts do not read stdin.',
    shortKickbacks: 'Boosted Mode sends prompts, replies, titles, and repo names. Not offered in the EEA, UK, or Switzerland.',
    shortSwag: 'No prompt or code upload, no boosted mode, same rules in every region.',
    sourceLabel: 'Privacy policy',
    sourceHref: 'https://kickbacks.ai/privacy',
  },
  {
    id: 'payouts',
    topic: 'Payouts',
    kickbacks:
      'Stripe Connect only, in batches roughly every two weeks, once the balance reaches $10. Where Stripe cannot pay out, the FAQ describes no other rail. Developers in India have reportedly been unable to withdraw.',
    swag:
      'Stripe, UPI (RazorpayX), Solana, Lightning, and API credits with a 10% bonus, on demand above $10. UPI is there for India. In this build every transfer is mocked or sandbox. No live payout has been sent from this repository.',
    shortKickbacks: 'Stripe Connect only, about every two weeks. No other rail where Stripe cannot pay.',
    shortSwag: 'Stripe, UPI, Solana, Lightning, or API credits, on demand above $10. Transfers here are mocked.',
    sourceLabel: 'Kickbacks FAQ',
    sourceHref: 'https://kickbacks.ai/faq',
  },
  {
    id: 'share',
    topic: 'Revenue share',
    kickbacks:
      'The terms, updated 24 July 2026, say an estimated 50% of net advertising revenue after operational expenses. The surface-pricing page also says 50% of what the advertiser pays. The terms say the split can change with notice.',
    swag:
      'A single setting, SWAG_DEVELOPER_SHARE_BPS, default 5000. That is 50% of the clearing price for the impression, which is the gross price of that impression, not a net figure after expenses. The homepage counter is this ledger. It is not a claim about other deployments.',
    shortKickbacks: '“Estimated 50% of net advertising revenue (after operational expenses).”',
    shortSwag: 'A stated share of the gross clearing price. Default 50%, one config value.',
    sourceLabel: 'Terms, 24 Jul 2026',
    sourceHref: 'https://kickbacks.ai/terms',
  },
  {
    id: 'advertisers',
    topic: 'Advertiser tools',
    kickbacks:
      'A campaign targets one surface, extension or terminal, and optionally up to 20 countries. The public site also documents an advertiser API.',
    swag:
      'Terminal, editor, or browser, plus a specific tool, and up to 20 countries. The advertiser API takes sm_test_ keys. Checkout in this build is a mock card charge.',
    shortKickbacks: 'Surface and country. An advertiser API is documented.',
    shortSwag: 'Surface, AI tool, and country, plus an API. Checkout here is mocked.',
    sourceLabel: 'Surface pricing',
    sourceHref: 'https://kickbacks.ai/surface-pricing',
  },
  {
    id: 'install',
    topic: 'Install',
    kickbacks:
      'Install is a VS Code-family extension: an npx command, a VSIX, or an editor install command. The FAQ says the extension is not on Open VSX. The original Marketplace listing was reportedly removed.',
    swag:
      'pnpm swag-money (the in-repo form of npx swag-money) detects installed tools and writes their official config. It does not install a patched editor extension.',
    shortKickbacks: 'A VS Code extension or VSIX. Terminal earning still depends on it.',
    shortSwag: 'One command writes official config for the tools it finds.',
    sourceLabel: 'Install guide',
    sourceHref: 'https://kickbacks.ai/install',
  },
]

export const MARKETPLACE_NOTE = {
  text: 'Third-party writeups say the original VS Code Marketplace listing was removed and that a separate site later offered a higher share. Ownership of that other site was not verified in our September 2026 notes, so it is not treated as fact here.',
  href: 'https://dariusjdavis.com/blog/kickbacks-ai-reverse-engineering/',
  label: 'dariusjdavis.com, 2026',
}
