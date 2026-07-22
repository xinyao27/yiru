import { CameraView } from 'expo-camera'
import { withUniwind } from 'uniwind'

// Why: Expo Camera is a third-party component, so it needs an explicit
// adapter before Uniwind can translate className into a native style.
export const UniwindCameraView = withUniwind(CameraView)
