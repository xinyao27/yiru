import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useMemo, useState } from 'react'
import { View, Text, Pressable, TextInput, Switch } from 'react-native'

import { MobileContentSection } from '@/components/content-section'
import { MobileGlassGroup } from '@/components/glass/group'
import { MobileGlassIconButton } from '@/components/glass/icon-button'
import { MobileGlassPressable } from '@/components/glass/pressable'
import { MobileGlassSurface } from '@/components/glass/surface'
import { MobileGlassTextButton } from '@/components/glass/text-button'
import { cn } from '@/style/class-names'

import {
  buildTerminalShortcutKey,
  normalizeShortcutKeyInput,
  TERMINAL_SHORTCUT_SPECIAL_KEYS,
  type TerminalShortcutModifier,
  type TerminalShortcutSpecialKey
} from '../terminal/accessory-keys'
import { BottomDrawer } from './bottom-drawer'

const CUSTOM_ACCESSORY_KEYS_STORAGE_KEY = 'yiru:custom-accessory-keys'

export type CustomKey = {
  id: string
  label: string
  bytes: string
  enter: boolean
}

type Step = 'choose-type' | 'shortcut-combo' | 'special-keys' | 'text-macro'

// Why: Alt is rendered with the ⌥ glyph because on macOS hosts the Option key
// is the only modifier that produces an ESC-prefixed byte sequence terminals
// can read. Cmd is intentionally absent — macOS swallows it before keystrokes
// reach the shell, so there's nothing to encode.
const SHORTCUT_MODIFIERS: { id: TerminalShortcutModifier; label: string; glyph?: string }[] = [
  { id: 'ctrl', label: 'Ctrl' },
  { id: 'alt', label: 'Alt', glyph: '⌥' },
  { id: 'shift', label: 'Shift' }
]

// Why: special keys are grouped by purpose so the picker reads as three small
// fixed grids rather than one ragged wrap row that clipped F7-F12.
const SPECIAL_KEY_GROUPS: { title: string; ids: string[]; columns: number }[] = [
  {
    title: 'Editing',
    ids: ['escape', 'tab', 'enter', 'backspace', 'delete', 'insert', 'space'],
    columns: 4
  },
  {
    title: 'Navigation',
    ids: ['arrowUp', 'arrowDown', 'arrowLeft', 'arrowRight', 'home', 'end', 'pageUp', 'pageDown'],
    columns: 4
  },
  {
    title: 'Function',
    ids: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'],
    columns: 6
  }
]

const SPECIAL_KEY_BY_ID: Record<string, TerminalShortcutSpecialKey> = Object.fromEntries(
  TERMINAL_SHORTCUT_SPECIAL_KEYS.map((key) => [key.id, key])
)

type Props = {
  visible: boolean
  onClose: () => void
  onKeysChanged: (keys: CustomKey[]) => void
  onManageShortcuts?: () => void
}

export async function loadCustomKeys(): Promise<CustomKey[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_ACCESSORY_KEYS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CustomKey[]) : []
  } catch {
    return []
  }
}

export async function saveCustomKeys(keys: CustomKey[]): Promise<void> {
  await AsyncStorage.setItem(CUSTOM_ACCESSORY_KEYS_STORAGE_KEY, JSON.stringify(keys))
}

export function CustomKeyModal({ visible, onClose, onKeysChanged, onManageShortcuts }: Props) {
  const [step, setStep] = useState<Step>('choose-type')
  const [shortcutKey, setShortcutKey] = useState('c')
  const [shortcutModifiers, setShortcutModifiers] = useState<TerminalShortcutModifier[]>(['ctrl'])
  const [macroLabel, setMacroLabel] = useState('')
  const [macroText, setMacroText] = useState('')
  const [macroEnter, setMacroEnter] = useState(true)
  const [previousVisible, setPreviousVisible] = useState(visible)

  // Why: reset before the opening commit so the drawer does not flash the last
  // custom-key draft; keep close state unchanged for the slide-out animation.
  if (visible !== previousVisible) {
    setPreviousVisible(visible)
    if (visible) {
      setStep('choose-type')
      setShortcutKey('c')
      setShortcutModifiers(['ctrl'])
      setMacroLabel('')
      setMacroText('')
      setMacroEnter(true)
    }
  }

  const addKey = useCallback(
    async (key: Omit<CustomKey, 'id'>) => {
      const existing = await loadCustomKeys()
      const newKey: CustomKey = { ...key, id: `custom-${Date.now()}` }
      const updated = [...existing, newKey]
      await saveCustomKeys(updated)
      onKeysChanged(updated)
      onClose()
    },
    [onClose, onKeysChanged]
  )

  const shortcutPreview = useMemo(
    () => buildTerminalShortcutKey({ key: shortcutKey, modifiers: shortcutModifiers }),
    [shortcutKey, shortcutModifiers]
  )

  const previewKeyLabel = useMemo(() => {
    const special = SPECIAL_KEY_BY_ID[shortcutKey]
    if (special) {
      return special.label
    }
    return shortcutKey.length === 1 ? shortcutKey.toUpperCase() : shortcutKey
  }, [shortcutKey])

  const orderedActiveModifiers = useMemo(
    () => SHORTCUT_MODIFIERS.filter((m) => shortcutModifiers.includes(m.id)),
    [shortcutModifiers]
  )

  const toggleShortcutModifier = useCallback((modifier: TerminalShortcutModifier) => {
    setShortcutModifiers((current) =>
      current.includes(modifier)
        ? current.filter((item) => item !== modifier)
        : [...current, modifier]
    )
  }, [])

  const handleShortcutKeyInput = useCallback((value: string) => {
    if (value === '') {
      // Why: allow the field to go empty so backspace works; the Save button
      // stays disabled until a valid key is entered.
      setShortcutKey('')
      return
    }
    const next = normalizeShortcutKeyInput(value)
    if (next) {
      setShortcutKey(next)
    }
  }, [])

  const handleSpecialKeyPick = useCallback((id: string) => {
    setShortcutKey(id)
    setStep('shortcut-combo')
  }, [])

  const handleShortcutSave = useCallback(() => {
    const built = buildTerminalShortcutKey({ key: shortcutKey, modifiers: shortcutModifiers })
    if (!built) {
      return
    }
    void addKey({ label: built.label, bytes: built.bytes, enter: false })
  }, [addKey, shortcutKey, shortcutModifiers])

  const handleMacroSave = useCallback(() => {
    const label = macroLabel.trim() || macroText.trim().slice(0, 12)
    const text = macroText
    if (!label || !text) {
      return
    }
    const bytes = macroEnter ? `${text}\r` : text
    void addKey({ label, bytes, enter: false })
  }, [addKey, macroLabel, macroText, macroEnter])

  const showBack = step !== 'choose-type'
  const onBack = useCallback(() => {
    if (step === 'special-keys') {
      setStep('shortcut-combo')
    } else {
      setStep('choose-type')
    }
  }, [step])

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View className="flex-row items-center pb-2">
        {showBack ? (
          <MobileGlassIconButton
            accessibilityLabel="Back"
            icon="back"
            onPress={onBack}
            size="small"
          />
        ) : (
          <View className="w-8" />
        )}
        <Text className="text-foreground flex-1 text-center text-sm font-semibold">
          {step === 'choose-type' && 'Add Shortcut'}
          {step === 'shortcut-combo' && 'Shortcut Combo'}
          {step === 'special-keys' && 'Pick a key'}
          {step === 'text-macro' && 'Text Macro'}
        </Text>
        <View className="w-8" />
      </View>

      {step === 'choose-type' && (
        <MobileContentSection>
          <Pressable
            className="active:bg-accent px-3 py-3"
            onPress={() => setStep('shortcut-combo')}
          >
            <Text className="text-foreground mb-1 text-sm">Shortcut Combo</Text>
            <Text className="text-muted-foreground text-xs">
              Build Ctrl, Alt, and Shift key chords
            </Text>
          </Pressable>
          <View className="h-hairline bg-border mx-3" />
          <Pressable className="active:bg-accent px-3 py-3" onPress={() => setStep('text-macro')}>
            <Text className="text-foreground mb-1 text-sm">Text Macro</Text>
            <Text className="text-muted-foreground text-xs">Send custom text command</Text>
          </Pressable>
          {onManageShortcuts ? (
            <>
              <View className="h-hairline bg-border mx-3" />
              <Pressable className="active:bg-accent px-3 py-3" onPress={onManageShortcuts}>
                <Text className="text-foreground mb-1 text-sm">Manage Shortcuts</Text>
                <Text className="text-muted-foreground text-xs">
                  Show, hide, or reorder shortcut keys
                </Text>
              </Pressable>
            </>
          ) : null}
        </MobileContentSection>
      )}

      {step === 'shortcut-combo' && (
        <View className="pt-2">
          <View className="flex-row flex-wrap items-center justify-center gap-2 py-5">
            {orderedActiveModifiers.map((modifier, index) => (
              <View key={modifier.id} className="flex-row items-center gap-2">
                {index > 0 ? <Text className="text-muted-foreground text-sm">+</Text> : null}
                <View className="border-border bg-card h-12 items-center justify-center rounded-xl border px-3">
                  <Text className="text-muted-foreground font-mono text-sm font-semibold">
                    {modifier.label}
                  </Text>
                </View>
              </View>
            ))}
            {orderedActiveModifiers.length > 0 ? (
              <Text className="text-muted-foreground text-sm">+</Text>
            ) : null}
            <View
              className={cn(
                'border-border bg-card h-12 min-w-12 items-center justify-center rounded-xl border px-3',
                !shortcutPreview && 'border-amber-500'
              )}
            >
              <Text
                className={cn(
                  'text-foreground font-mono text-sm font-semibold',
                  !shortcutPreview && 'text-amber-500'
                )}
              >
                {previewKeyLabel}
              </Text>
            </View>
          </View>

          <View className="mt-3">
            <Text className="text-muted-foreground mb-2 pl-1 text-xs tracking-wider uppercase">
              Modifiers
            </Text>
            <MobileGlassGroup className="flex-row gap-2" spacing={8}>
              {SHORTCUT_MODIFIERS.map((modifier) => {
                const selected = shortcutModifiers.includes(modifier.id)
                return (
                  <MobileGlassPressable
                    key={modifier.id}
                    className="h-10 flex-1 rounded-xl"
                    contentClassName="h-full flex-row items-center justify-center gap-1 rounded-xl"
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => toggleShortcutModifier(modifier.id)}
                    tintColorClassName={selected ? 'accent-primary' : undefined}
                  >
                    <Text
                      className={cn('text-muted-foreground text-sm', selected && 'text-foreground')}
                    >
                      {modifier.label}
                    </Text>
                    {modifier.glyph ? (
                      <Text className="text-muted-foreground font-mono text-xs">
                        {modifier.glyph}
                      </Text>
                    ) : null}
                  </MobileGlassPressable>
                )
              })}
            </MobileGlassGroup>
          </View>

          <View className="mt-3">
            <Text className="text-muted-foreground mb-2 pl-1 text-xs tracking-wider uppercase">
              Key
            </Text>
            <MobileGlassSurface className="h-14 w-full overflow-hidden rounded-xl" isInteractive>
              <TextInput
                className="text-foreground h-full w-full text-center font-mono text-sm"
                value={shortcutKey.length === 1 ? shortcutKey.toUpperCase() : ''}
                onChangeText={handleShortcutKeyInput}
                placeholder={SPECIAL_KEY_BY_ID[shortcutKey]?.label ?? 'C'}
                placeholderTextColorClassName="accent-muted-foreground"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={1}
              />
            </MobileGlassSurface>
            <MobileGlassTextButton
              className="mt-2 self-center"
              label="More keys — Tab, arrows, F1–F12…"
              onPress={() => setStep('special-keys')}
              size="small"
            />
          </View>

          <MobileGlassTextButton
            className="mt-3"
            disabled={!shortcutPreview}
            isFullWidth
            isProminent
            label="Add"
            onPress={handleShortcutSave}
            size="large"
          />
        </View>
      )}

      {step === 'special-keys' && (
        <View className="gap-3 pt-1 pb-3">
          {SPECIAL_KEY_GROUPS.map((group) => (
            <View key={group.title} className="gap-1">
              <Text className="text-muted-foreground mb-1 pl-1 text-xs tracking-wider uppercase">
                {group.title}
              </Text>
              <MobileGlassGroup className="-mx-1 flex-row flex-wrap" spacing={8}>
                {group.ids.map((id) => {
                  const key = SPECIAL_KEY_BY_ID[id]
                  if (!key) {
                    return null
                  }
                  const selected = shortcutKey === id
                  const flexBasis = `${100 / group.columns}%` as const
                  return (
                    <View key={id} className="px-1 py-1" style={[{ flexBasis }]}>
                      <MobileGlassPressable
                        className="h-10 rounded-xl"
                        contentClassName="h-full items-center justify-center rounded-xl"
                        accessibilityLabel={key.accessibilityLabel}
                        accessibilityState={{ selected }}
                        onPress={() => handleSpecialKeyPick(id)}
                        tintColorClassName={selected ? 'accent-primary' : undefined}
                      >
                        <Text className="text-foreground font-mono text-xs">{key.label}</Text>
                      </MobileGlassPressable>
                    </View>
                  )
                })}
              </MobileGlassGroup>
            </View>
          ))}
        </View>
      )}

      {step === 'text-macro' && (
        <MobileContentSection>
          <View className="gap-2 p-3">
            <Text className="text-muted-foreground text-xs">Label</Text>
            <MobileGlassSurface className="overflow-hidden rounded-xl" isInteractive>
              <TextInput
                className="text-foreground px-3 py-2 font-mono text-sm"
                value={macroLabel}
                onChangeText={setMacroLabel}
                placeholder="e.g. Build"
                placeholderTextColorClassName="accent-muted-foreground"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </MobileGlassSurface>
            <Text className="text-muted-foreground text-xs">Command</Text>
            <MobileGlassSurface className="overflow-hidden rounded-xl" isInteractive>
              <TextInput
                className="text-foreground px-3 py-2 font-mono text-sm"
                value={macroText}
                onChangeText={setMacroText}
                placeholder="e.g. pnpm build"
                placeholderTextColorClassName="accent-muted-foreground"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </MobileGlassSurface>
            <View className="flex-row items-center justify-between py-1">
              <Text className="text-foreground text-sm">Press Enter</Text>
              <Switch
                value={macroEnter}
                onValueChange={setMacroEnter}
                trackColorOffClassName="accent-secondary"
                trackColorOnClassName="accent-muted-foreground"
                thumbColorClassName="accent-foreground"
                ios_backgroundColorClassName="accent-secondary"
              />
            </View>
            <MobileGlassTextButton
              className="mt-3"
              disabled={!macroText.trim()}
              isFullWidth
              isProminent
              label="Add Shortcut"
              onPress={handleMacroSave}
              size="large"
            />
          </View>
        </MobileContentSection>
      )}
    </BottomDrawer>
  )
}
