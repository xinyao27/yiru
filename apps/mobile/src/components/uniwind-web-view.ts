import { WebView } from 'react-native-webview'
import { withUniwind } from 'uniwind'

// Why: WebView is a third-party component, so Uniwind cannot map className
// until it is explicitly wrapped.
export const UniwindWebView = withUniwind(WebView)
