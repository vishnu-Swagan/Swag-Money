const form = document.querySelector('#config')
const statusNode = document.querySelector('#status')

async function restore() {
  const config = await chrome.storage.local.get(['apiUrl', 'installId', 'privateKey', 'pin'])
  if (!(form instanceof HTMLFormElement)) return
  const fields = new FormData(form)
  for (const key of fields.keys()) {
    const input = form.elements.namedItem(key)
    const value = config[key as keyof typeof config]
    if (input instanceof HTMLInputElement && typeof value === 'string') input.value = value
  }
}

form?.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!(form instanceof HTMLFormElement)) return
  const data = new FormData(form)
  void chrome.storage.local
    .set({
      apiUrl: String(data.get('apiUrl') ?? ''),
      installId: String(data.get('installId') ?? ''),
      privateKey: String(data.get('privateKey') ?? ''),
      pin: String(data.get('pin') ?? ''),
    })
    .then(() => {
      if (statusNode) statusNode.textContent = 'Saved locally. Nothing was uploaded except what the content script signs.'
    })
})

void restore()
