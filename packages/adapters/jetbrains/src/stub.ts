import type { RenderSurface } from '@swag-money/client-core'

export class AdapterNotImplementedError extends Error {
  readonly code = 'not_implemented'

  constructor(message: string) {
    super(message)
    this.name = 'AdapterNotImplementedError'
  }
}

const MESSAGE =
  'The JetBrains runtime is not built in this repo. plugin.xml registers a StatusBarWidgetFactory and SwagMoneyRenderSurface.kt sketches the text contract. It must write only the verified string, read that widget text back, and must not download bytecode or widen the IDE sandbox.'

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
