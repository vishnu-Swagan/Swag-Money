package ai.swagmoney

/**
 * Stub. Not registered in plugin.xml and not compiled by this repo's TypeScript build.
 *
 * When this is implemented, the status-bar widget is the render surface:
 * write the verified ASCII string, read it back for the 5-second challenge,
 * then restore the previous text. The plugin must pin the server Ed25519 key
 * and refuse any payload that is not a signed string. It must not download
 * or execute code from the Swag-Money API.
 */
/** Registered from plugin.xml. Not compiled against the IntelliJ SDK in this repo. */
class SwagStatusWidgetFactory

class SwagMoneyRenderSurface {
    fun write(text: String) {
        throw NotImplementedError("JetBrains RenderSurface.write is a stub")
    }

    fun readBack(): String {
        throw NotImplementedError("JetBrains RenderSurface.readBack is a stub")
    }

    fun restore() {
        throw NotImplementedError("JetBrains RenderSurface.restore is a stub")
    }
}
