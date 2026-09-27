import type { RenderSurface } from '@swag-money/client-core'

export class AdapterNotImplementedError extends Error {
  readonly code = 'not_implemented'

  constructor(message: string) {
    super(message)
    this.name = 'AdapterNotImplementedError'
  }
}

const MESSAGE =
  'The JetBrains adapter is a stub. A plugin should implement RenderSurface by writing the verified string into the status bar, reading it back for the render challenge, and restoring the previous text. It must not download bytecode or widen the IDE sandbox.'

/** Shared-core placeholder so the JetBrains plugin has a typed contract to implement. */
export function createJetBrainsSurface(): RenderSurface {
  const fail = () => {
    throw new AdapterNotImplementedError(MESSAGE)
  }
  return {
    kind: 'jetbrains',
    write: fail,
    readBack: fail,
    restore: fail,
  }
}
