import * as vscode from 'vscode'
import { runImpression, type RenderSurface } from '@swag-money/client-core'
import { b64UrlToBytes } from '@swag-money/crypto'

/**
 * VS Code-family adapter (VS Code, Cursor, Windsurf).
 * The status bar item is the render surface. The extension sets `text` to a
 * verified string and reads that same property back. It does not patch CSP,
 * download code, or eval anything from the API.
 */
export function activate(context: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  item.name = 'Swag-Money'
  context.subscriptions.push(item)

  const command = vscode.commands.registerCommand('swagMoney.showSignedAd', async () => {
    const config = vscode.workspace.getConfiguration('swagMoney')
    const apiUrl = config.get<string>('apiUrl') ?? 'http://127.0.0.1:8787'
    const installId = config.get<string>('installId') ?? ''
    const devicePrivateKey = config.get<string>('devicePrivateKey') ?? ''
    const pinnedPublicKey = config.get<string>('pinnedPublicKey') ?? ''
    if (!installId || !devicePrivateKey || !pinnedPublicKey) {
      void vscode.window.showWarningMessage('Set swagMoney.installId, devicePrivateKey, and pinnedPublicKey first.')
      return
    }
    const surface = new StatusBarSurface(item)
    try {
      const result = await runImpression({
        apiUrl,
        installId,
        devicePrivateKey: b64UrlToBytes(devicePrivateKey),
        pinnedPublicKey: b64UrlToBytes(pinnedPublicKey),
        surface,
      })
      void vscode.window.showInformationMessage(
        `Swag-Money verified ${result.developerShareCents} cents for ${result.advertiser}.`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Swag-Money failed'
      void vscode.window.showErrorMessage(message)
    }
  })
  context.subscriptions.push(command)
}

export function deactivate() {
  // Status bar item is disposed with the extension context.
}

class StatusBarSurface implements RenderSurface {
  readonly kind = 'vscode' as const
  private previous = ''

  constructor(private readonly item: vscode.StatusBarItem) {}

  write(text: string) {
    this.previous = this.item.text
    this.item.text = text
    this.item.tooltip = 'Swag-Money verified string. This extension does not execute remote code.'
    this.item.show()
  }

  readBack() {
    return this.item.text
  }

  restore() {
    this.item.text = this.previous
    if (!this.previous) this.item.hide()
  }
}
