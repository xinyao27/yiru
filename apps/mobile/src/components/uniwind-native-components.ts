import { GestureHandlerRootView as NativeGestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaView as NativeSafeAreaView } from 'react-native-safe-area-context'
import { withUniwind } from 'uniwind'

// Why: these third-party containers accept View props but need explicit
// wrapping before Uniwind can resolve their className values.
export const GestureHandlerRootView = withUniwind(NativeGestureHandlerRootView)
export const SafeAreaView = withUniwind(NativeSafeAreaView)

export * from 'react-native-gesture-handler'
export {
  SafeAreaListener,
  SafeAreaProvider,
  useSafeAreaInsets
} from 'react-native-safe-area-context'
