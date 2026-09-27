import { runImpression, type RenderSurface } from '@swag-money/client-core'
import { b64UrlToBytes } from '@swag-money/crypto'
import { applyAdText, findWaitState } from './dom.ts'

/**
 * Content script for chatgpt.com and claude.ai.
 * It replaces the text of an existing wait-state node. It does not inject
 * scripts, use innerHTML, eval, or change the page CSP.
 */
async function main() {
  const config = await chrome.storage.local.get(['apiUrl', 'installId', 'privateKey', 'pin'])
  if (!config.installId || !config.privateKey || !config.pin) return
  const slot = findWaitState(document)
  if (!slot) return
  const previous = slot.textContent ?? ''
  const surface: RenderSurface = {
    kind: 'browser',
    write(text) {
      applyAdText(slot, text)
    },
    readBack() {
      return slot.textContent ?? ''
    },
    restore() {
      slot.textContent = previous
    },
  }
  try {
    await runImpression({
      apiUrl: config.apiUrl || 'http://127.0.0.1:8787',
      installId: config.installId,
      devicePrivateKey: b64UrlToBytes(config.privateKey),
      pinnedPublicKey: b64UrlToBytes(config.pin),
      surface,
    })
  } catch (error) {
    surface.restore()
    console.warn('Swag-Money did not verify an impression', error)
  }
}

void main()
