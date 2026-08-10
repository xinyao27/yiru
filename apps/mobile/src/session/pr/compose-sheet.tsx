import { Linking } from 'react-native'

export function openMobilePrUrl(url: string): void {
  // Why: Linking.openURL rejects when iOS/Android can't open the URL (no app,
  // bad scheme, etc.). Without a catch that surfaces as LogBox "Uncaught
  // (in promise) Error: Unable to open URL…" over the PR screen.
  void Linking.openURL(url).catch(() => {})
}
