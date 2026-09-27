type SwagStorage = {
  apiUrl?: string
  installId?: string
  privateKey?: string
  pin?: string
}

declare global {
  const chrome: {
    storage: {
      local: {
        get(keys: string[]): Promise<SwagStorage>
        set(items: SwagStorage): Promise<void>
      }
    }
    runtime: {
      onInstalled: { addListener(listener: () => void): void }
    }
  }
}

export {}
