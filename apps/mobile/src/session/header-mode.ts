import { Platform } from 'react-native'

export function shouldUseNativeSessionHeader(isWideLayout: boolean): boolean {
  return Platform.OS === 'ios' && !isWideLayout
}
