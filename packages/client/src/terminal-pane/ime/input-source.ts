export type MacNativeTextInputSourceFeatures = Readonly<{
  forwardAsciiPunctuation: boolean
  forwardShortTextReplacements: boolean
}>

// Why: Chrome exposes layout fingerprints but not the native macOS input-source
// identity needed to safely enable source-specific forwarding.
export const DISABLED_MAC_NATIVE_TEXT_INPUT_SOURCE_FEATURES = Object.freeze({
  forwardAsciiPunctuation: false,
  forwardShortTextReplacements: false
}) satisfies MacNativeTextInputSourceFeatures
