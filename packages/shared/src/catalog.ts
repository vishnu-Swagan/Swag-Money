export const SURFACES = [
  'claude-code',
  'codex-cli',
  'gemini-cli',
  'qwen-code',
  'copilot-cli',
  'antigravity-cli',
  'opencode',
  'kilo',
  'goose',
  'vscode',
  'cursor',
  'windsurf',
  'cline',
  'kiro',
  'jetbrains',
  'browser',
  'chatgpt',
  'claude-web',
  'gemini-web',
  'grok',
  'perplexity',
  'deepseek',
  'mistral',
  'v0',
  'bolt',
  'lovable',
  'replit',
] as const

export type Surface = (typeof SURFACES)[number]

export function isSurface(value: string): value is Surface {
  return (SURFACES as readonly string[]).includes(value)
}

export const PLACEMENTS = ['terminal', 'editor', 'browser'] as const
export type Placement = (typeof PLACEMENTS)[number]

export type IntegrationStatus = 'working' | 'beta' | 'scaffold'

export type ToolIntegration = {
  id: string
  surface: Surface
  name: string
  placement: Placement
  status: IntegrationStatus
  /** When false, checkout will not sell this row as its own surface. */
  sellable: boolean
  mechanism: string
  install: string
}

export const TOOLS: readonly ToolIntegration[] = [
  {
    id: 'claude-code',
    surface: 'claude-code',
    name: 'Claude Code CLI',
    placement: 'terminal',
    status: 'working',
    sellable: true,
    mechanism:
      'Official settings only: spinnerVerbs for the verified impression, spinnerTipsOverride with the label "Sponsored", and a statusLine script. The script prints a local file. It does not read transcripts.',
    install:
      'The installer merges ~/.claude/settings.json and writes ~/.swag-money/statusline.sh. Uninstall restores the backup beside the settings file.',
  },
  {
    id: 'claude-code-vscode',
    surface: 'claude-code',
    name: 'Claude Code in VS Code',
    placement: 'editor',
    status: 'beta',
    sellable: false,
    mechanism:
      'Anthropic documents that the VS Code extension reads the same settings file as the CLI. This environment cannot install that extension, so panel rendering is unverified. Swag-Money does not patch the extension bundle or its CSP.',
    install:
      'Install Claude Code for VS Code from the marketplace, then run the same settings merge as the CLI. There is no second plugin and no webview patch.',
  },
  {
    id: 'codex-cli',
    surface: 'codex-cli',
    name: 'OpenAI Codex CLI',
    placement: 'terminal',
    status: 'beta',
    sellable: true,
    mechanism:
      'Hooks in ~/.codex/hooks.json for turn start and stop. The hook script does not read stdin, so the prompt stays in Codex. Codex has no official custom spinner string yet.',
    install: 'The installer writes the hooks file and a local timing script when ~/.codex exists.',
  },
  {
    id: 'gemini-cli',
    surface: 'gemini-cli',
    name: 'Gemini CLI',
    placement: 'terminal',
    status: 'beta',
    sellable: true,
    mechanism:
      'ui.customWittyPhrases plus ui.loadingPhrases set to "witty" in ~/.gemini/settings.json. Phrases are prefixed "Sponsored · ". The Gemini binary was not run here.',
    install: 'The installer merges the ui object and leaves every other Gemini setting in place.',
  },
  {
    id: 'qwen-code',
    surface: 'qwen-code',
    name: 'Qwen Code',
    placement: 'terminal',
    status: 'beta',
    sellable: true,
    mechanism: 'Same phrase keys as Gemini CLI, written to ~/.qwen/settings.json. Not executed against the Qwen binary in this environment.',
    install: 'Detected from ~/.qwen. The installer merges ui.customWittyPhrases.',
  },
  {
    id: 'copilot-cli',
    surface: 'copilot-cli',
    name: 'GitHub Copilot CLI',
    placement: 'terminal',
    status: 'beta',
    sellable: true,
    mechanism:
      'Experimental statusLine command in ~/.copilot/config.json, with experimental_flags including STATUS_LINE. The command prints a local file and does not read the session.',
    install: 'Detected from ~/.copilot. Treat this as experimental, matching Copilot CLI itself.',
  },
  {
    id: 'antigravity-cli',
    surface: 'antigravity-cli',
    name: 'Antigravity CLI',
    placement: 'terminal',
    status: 'beta',
    sellable: true,
    mechanism:
      'statusLine command in ~/.gemini/antigravity-cli/settings.json. The script reads stdin only to check agent_state, then discards the object. It shows the line during thinking, working, or tool use.',
    install: 'Detected from ~/.gemini/antigravity-cli. The script is local and does not phone home.',
  },
  {
    id: 'opencode',
    surface: 'opencode',
    name: 'OpenCode',
    placement: 'terminal',
    status: 'scaffold',
    sellable: true,
    mechanism:
      'A plugin file that would toast a local sponsored line on session status events. It is not packaged or loaded by OpenCode in this repo.',
    install: 'The installer drops the plugin source under ~/.config/opencode/plugin/swag-money.ts when OpenCode is present. You still have to enable it.',
  },
  {
    id: 'kilo',
    surface: 'kilo',
    name: 'Kilo',
    placement: 'terminal',
    status: 'scaffold',
    sellable: true,
    mechanism: 'A plugin source file in the OpenCode-style hooks shape. Not loaded by Kilo here.',
    install: 'Written under ~/.kilocode/plugin/swag-money.ts when a Kilo config directory exists.',
  },
  {
    id: 'goose',
    surface: 'goose',
    name: 'Goose',
    placement: 'terminal',
    status: 'scaffold',
    sellable: true,
    mechanism:
      'A GOOSE_STATUS_HOOK script that prints a local line when the argument is thinking or waiting. Goose itself is not installed or invoked here.',
    install: 'The installer writes ~/.config/goose/swag-money-status.sh and prints the env var to export.',
  },
  {
    id: 'vscode',
    surface: 'vscode',
    name: 'VS Code',
    placement: 'editor',
    status: 'beta',
    sellable: true,
    mechanism:
      'Official StatusBarItem API. The extension sets item.text to the verified string and reads that property back. It does not patch other extensions.',
    install: 'Build packages/adapters/vscode and install the VSIX locally, or run the extension from this repo. Set swagMoney.surface to vscode.',
  },
  {
    id: 'cursor',
    surface: 'cursor',
    name: 'Cursor',
    placement: 'editor',
    status: 'beta',
    sellable: true,
    mechanism:
      'Cursor hooks (.cursor/hooks.json) for beforeSubmitPrompt and stop, plus the same status-bar extension with swagMoney.surface set to cursor. workbench.html is not modified.',
    install: 'The installer writes the hooks file when ~/.cursor exists. The hook script does not read stdin.',
  },
  {
    id: 'windsurf',
    surface: 'windsurf',
    name: 'Windsurf',
    placement: 'editor',
    status: 'beta',
    sellable: true,
    mechanism:
      'Windsurf hooks for pre_user_prompt and post_cascade_response, plus the status-bar extension with swagMoney.surface set to windsurf.',
    install: 'Hook file: ~/.codeium/windsurf/hooks.json. The command does not read the prompt.',
  },
  {
    id: 'cline',
    surface: 'cline',
    name: 'Cline',
    placement: 'editor',
    status: 'beta',
    sellable: true,
    mechanism: 'A Cline hook file under .clinerules/hooks for TaskStart and TaskComplete, plus the status-bar extension.',
    install: 'The installer writes the hook JSON when ~/.cline exists. Enable the status-bar extension separately.',
  },
  {
    id: 'kiro',
    surface: 'kiro',
    name: 'Kiro',
    placement: 'editor',
    status: 'beta',
    sellable: true,
    mechanism: 'A .kiro/hooks JSON file for SessionStart and Stop, plus the status-bar extension with swagMoney.surface set to kiro.',
    install: 'Detected from ~/.kiro. The hook command appends a local timestamp and does not read the prompt.',
  },
  {
    id: 'jetbrains',
    surface: 'jetbrains',
    name: 'JetBrains',
    placement: 'editor',
    status: 'scaffold',
    sellable: true,
    mechanism:
      'A minimal plugin scaffold: plugin.xml registers a StatusBarWidgetFactory, and a Kotlin widget sketches the text contract. It is not compiled against the IntelliJ SDK in this repo. The TypeScript surface still fails closed.',
    install: 'Sources live in packages/adapters/jetbrains/plugin. Load them in a JetBrains plugin project when you are ready to build.',
  },
  {
    id: 'chatgpt',
    surface: 'chatgpt',
    name: 'ChatGPT',
    placement: 'browser',
    status: 'beta',
    sellable: true,
    mechanism: 'MV3 content script on chatgpt.com. It looks for a stop control, then writes one text node. No page CSP change and no injected script.',
    install: 'Load packages/adapters/browser as an unpacked extension. Selectors are best-effort and will break when the site changes.',
  },
  {
    id: 'claude-web',
    surface: 'claude-web',
    name: 'Claude.ai',
    placement: 'browser',
    status: 'beta',
    sellable: true,
    mechanism: 'Content script on claude.ai during the generating state. Text only. Anthropic has said Claude is not an ad surface; this adapter is opt-in on your browser.',
    install: 'Same unpacked extension. The host match is claude.ai.',
  },
  {
    id: 'gemini-web',
    surface: 'gemini-web',
    name: 'Gemini',
    placement: 'browser',
    status: 'beta',
    sellable: true,
    mechanism: 'Content script on gemini.google.com. Sponsored line is an extension-owned text node beside the stop control.',
    install: 'Unpacked extension. Host gemini.google.com.',
  },
  {
    id: 'grok',
    surface: 'grok',
    name: 'Grok',
    placement: 'browser',
    status: 'beta',
    sellable: true,
    mechanism: 'Content script on grok.com. x.com is intentionally not matched, so the rest of X is left alone.',
    install: 'Unpacked extension. Host grok.com.',
  },
  {
    id: 'perplexity',
    surface: 'perplexity',
    name: 'Perplexity',
    placement: 'browser',
    status: 'beta',
    sellable: true,
    mechanism: 'Content script on perplexity.ai while a stop control is present.',
    install: 'Unpacked extension. Hosts perplexity.ai and www.perplexity.ai.',
  },
  {
    id: 'deepseek',
    surface: 'deepseek',
    name: 'DeepSeek',
    placement: 'browser',
    status: 'beta',
    sellable: true,
    mechanism: 'Content script on chat.deepseek.com during generation.',
    install: 'Unpacked extension. Host chat.deepseek.com.',
  },
  {
    id: 'mistral',
    surface: 'mistral',
    name: 'Mistral Le Chat',
    placement: 'browser',
    status: 'beta',
    sellable: true,
    mechanism: 'Content script on chat.mistral.ai during generation.',
    install: 'Unpacked extension. Host chat.mistral.ai.',
  },
  {
    id: 'v0',
    surface: 'v0',
    name: 'v0',
    placement: 'browser',
    status: 'beta',
    sellable: true,
    mechanism: 'Content script on v0.dev during a build or generation wait. Long waits are the inventory.',
    install: 'Unpacked extension. Host v0.dev.',
  },
  {
    id: 'bolt',
    surface: 'bolt',
    name: 'Bolt',
    placement: 'browser',
    status: 'beta',
    sellable: true,
    mechanism: 'Content script on bolt.new during generation.',
    install: 'Unpacked extension. Host bolt.new.',
  },
  {
    id: 'lovable',
    surface: 'lovable',
    name: 'Lovable',
    placement: 'browser',
    status: 'beta',
    sellable: true,
    mechanism: 'Content script on lovable.dev during generation.',
    install: 'Unpacked extension. Host lovable.dev.',
  },
  {
    id: 'replit',
    surface: 'replit',
    name: 'Replit',
    placement: 'browser',
    status: 'beta',
    sellable: true,
    mechanism: 'Content script on replit.com during agent generation. Replit was not executed here.',
    install: 'Unpacked extension. Host replit.com.',
  },
]

export function toolById(id: string): ToolIntegration | undefined {
  return TOOLS.find((tool) => tool.id === id)
}

export function placementForSurface(surface: string): Placement | 'any' {
  if (surface === 'browser') return 'browser'
  const tool = TOOLS.find((entry) => entry.surface === surface)
  return tool?.placement ?? 'any'
}

export function surfacesForPlacement(placement: Placement): Surface[] {
  const seen = new Set<Surface>()
  for (const tool of TOOLS) {
    if (tool.sellable && tool.placement === placement) seen.add(tool.surface)
  }
  return [...seen]
}

export function normalizeCountries(input: readonly string[]): string[] {
  const codes = input.map((code) => code.trim().toUpperCase())
  for (const code of codes) {
    if (!/^[A-Z]{2}$/.test(code)) {
      throw new Error(`Invalid country code ${code}`)
    }
  }
  return [...new Set(codes)]
}
