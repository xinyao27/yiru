import path from 'node:path'

export const mobileRoot = path.resolve(import.meta.dirname, '..')
export const sourceRoots = [path.join(mobileRoot, 'app'), path.join(mobileRoot, 'src')]
export const forbiddenReactNativeControls = new Set(['Button', 'Switch'])
export const universalJsxControls = new Set([
  'BottomSheet',
  'Button',
  'Checkbox',
  'Collapsible',
  'Column',
  'FieldGroup',
  'Icon',
  'List',
  'ListItem',
  'Picker',
  'RNHostView',
  'Row',
  'ScrollView',
  'Slider',
  'Spacer',
  'State',
  'Switch',
  'Text',
  'TextInput'
])

const expoUiHostPath = path.join(mobileRoot, 'src', 'components', 'expo-ui-host.tsx')
export const bottomDrawerPaths = new Set([
  path.join(mobileRoot, 'src', 'components', 'bottom-drawer.tsx'),
  path.join(mobileRoot, 'src', 'components', 'bottom-drawer-sheet.tsx'),
  path.join(mobileRoot, 'src', 'components', 'bottom-drawer-sheet.native.tsx')
])
const nativeControlCatalogPath = path.join(
  mobileRoot,
  'src',
  'ui-lab',
  'native-control-catalog.tsx'
)
const settingsToggleRowPath = path.join(mobileRoot, 'src', 'components', 'settings-toggle-row.tsx')

export const universalHostAdapterPaths = new Set([expoUiHostPath])
export const reactNativeControlAdapterAllowlist = new Map([
  [settingsToggleRowPath, new Set(['Switch'])]
])
export const universalControlImportAllowlist = new Map([
  ['Switch', new Set([nativeControlCatalogPath])]
])
// Why: adapter files may need to assemble a Universal control before exposing a
// product-level boundary; every ordinary feature must render controls inside ExpoUiHost.
export const universalControlHostWhitelist = new Set([expoUiHostPath])

export function isExpoUiHostModule(moduleName) {
  return moduleName === '~/components/expo-ui-host' || moduleName.endsWith('/expo-ui-host')
}

export function isExpoUiModule(moduleName) {
  return moduleName === '@expo/ui' || moduleName.startsWith('@expo/ui/')
}

export function isGovernedModule(moduleName) {
  return moduleName === 'react-native' || isExpoUiModule(moduleName)
}
