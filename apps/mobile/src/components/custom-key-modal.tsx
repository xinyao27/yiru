import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useMemo, useState } from 'react'
import { View, Text, Pressable, TextInput, Switch } from 'react-native'

import { CaretLeft as ChevronLeft } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import {
  buildTerminalShortcutKey,
  normalizeShortcutKeyInput,
  TERMINAL_SHORTCUT_SPECIAL_KEYS,
  type TerminalShortcutModifier,
  type TerminalShortcutSpecialKey
} from '../terminal/terminal-accessory-keys'
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
      <View className={styles.header}>
        {showBack ? (
          <Pressable
            className={cn(styles.backButton, styles.backButtonPressedActive)}
            onPress={onBack}
            accessibilityLabel="Back"
          >
            <ChevronLeft size={18} colorClassName="accent-muted-foreground" />
          </Pressable>
        ) : (
          <View className={styles.backSpacer} />
        )}
        <Text className={styles.title}>
          {step === 'choose-type' && 'Add Shortcut'}
          {step === 'shortcut-combo' && 'Shortcut Combo'}
          {step === 'special-keys' && 'Pick a key'}
          {step === 'text-macro' && 'Text Macro'}
        </Text>
        <View className={styles.backSpacer} />
      </View>

      {step === 'choose-type' && (
        <View className={styles.group}>
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => setStep('shortcut-combo')}
          >
            <Text className={styles.rowLabel}>Shortcut Combo</Text>
            <Text className={styles.rowHint}>Build Ctrl, Alt, and Shift key chords</Text>
          </Pressable>
          <View className={styles.separator} />
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => setStep('text-macro')}
          >
            <Text className={styles.rowLabel}>Text Macro</Text>
            <Text className={styles.rowHint}>Send custom text command</Text>
          </Pressable>
          {onManageShortcuts ? (
            <>
              <View className={styles.separator} />
              <Pressable
                className={cn(styles.row, styles.rowPressedActive)}
                onPress={onManageShortcuts}
              >
                <Text className={styles.rowLabel}>Manage Shortcuts</Text>
                <Text className={styles.rowHint}>Show, hide, or reorder shortcut keys</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      )}

      {step === 'shortcut-combo' && (
        <View className={styles.shortcutForm}>
          <View className={styles.preview}>
            {orderedActiveModifiers.map((modifier, index) => (
              <View key={modifier.id} className={styles.previewKeycapRow}>
                {index > 0 ? <Text className={styles.previewPlus}>+</Text> : null}
                <View className={cn(styles.keycap, styles.keycapModifier)}>
                  <Text className={styles.keycapModifierText}>{modifier.label}</Text>
                </View>
              </View>
            ))}
            {orderedActiveModifiers.length > 0 ? (
              <Text className={styles.previewPlus}>+</Text>
            ) : null}
            <View className={cn(styles.keycap, !shortcutPreview && styles.keycapWarn)}>
              <Text className={cn(styles.keycapText, !shortcutPreview && styles.keycapTextWarn)}>
                {previewKeyLabel}
              </Text>
            </View>
          </View>

          <View className={styles.section}>
            <Text className={styles.sectionLabel}>Modifiers</Text>
            <View className={styles.mods}>
              {SHORTCUT_MODIFIERS.map((modifier) => {
                const selected = shortcutModifiers.includes(modifier.id)
                return (
                  <Pressable
                    key={modifier.id}
                    className={cn(
                      styles.chip,
                      selected && styles.chipSelected,
                      !selected && styles.chipPressedActive
                    )}
                    onPress={() => toggleShortcutModifier(modifier.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text className={cn(styles.chipText, selected && styles.chipTextSelected)}>
                      {modifier.label}
                    </Text>
                    {modifier.glyph ? (
                      <Text className={cn(styles.chipGlyph, selected && styles.chipGlyphSelected)}>
                        {modifier.glyph}
                      </Text>
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          </View>

          <View className={styles.section}>
            <Text className={styles.sectionLabel}>Key</Text>
            <TextInput
              className={styles.keyInput}
              value={shortcutKey.length === 1 ? shortcutKey.toUpperCase() : ''}
              onChangeText={handleShortcutKeyInput}
              placeholder={SPECIAL_KEY_BY_ID[shortcutKey]?.label ?? 'C'}
              placeholderTextColorClassName="accent-muted-foreground"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={1}
            />
            <Pressable
              className={cn(styles.moreLink, styles.moreLinkPressedActive)}
              onPress={() => setStep('special-keys')}
            >
              <Text className={styles.moreLinkText}>More keys — Tab, arrows, F1–F12…</Text>
            </Pressable>
          </View>

          <Pressable
            className={cn(styles.saveButton, !shortcutPreview && styles.saveButtonDisabled)}
            disabled={!shortcutPreview}
            onPress={handleShortcutSave}
          >
            <Text
              className={cn(
                styles.saveButtonText,
                !shortcutPreview && styles.saveButtonTextDisabled
              )}
            >
              Add
            </Text>
          </Pressable>
        </View>
      )}

      {step === 'special-keys' && (
        <View className={styles.specialKeysForm}>
          {SPECIAL_KEY_GROUPS.map((group) => (
            <View key={group.title} className={styles.specialGroup}>
              <Text className={styles.specialGroupTitle}>{group.title}</Text>
              <View className={styles.keyGrid}>
                {group.ids.map((id) => {
                  const key = SPECIAL_KEY_BY_ID[id]
                  if (!key) {
                    return null
                  }
                  const selected = shortcutKey === id
                  const flexBasis = `${100 / group.columns}%` as const
                  return (
                    <View key={id} className={styles.keyCellWrap} style={[{ flexBasis }]}>
                      <Pressable
                        className={cn(
                          styles.keyCell,
                          selected && styles.keyCellSelected,
                          !selected && styles.keyCellPressedActive
                        )}
                        onPress={() => handleSpecialKeyPick(id)}
                        accessibilityLabel={key.accessibilityLabel}
                        accessibilityState={{ selected }}
                      >
                        <Text
                          className={cn(styles.keyCellText, selected && styles.keyCellTextSelected)}
                        >
                          {key.label}
                        </Text>
                      </Pressable>
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
        </View>
      )}

      {step === 'text-macro' && (
        <View className={styles.group}>
          <View className={styles.macroForm}>
            <Text className={styles.fieldLabel}>Label</Text>
            <TextInput
              className={styles.fieldInput}
              value={macroLabel}
              onChangeText={setMacroLabel}
              placeholder="e.g. Build"
              placeholderTextColorClassName="accent-muted-foreground"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text className={styles.fieldLabel}>Command</Text>
            <TextInput
              className={styles.fieldInput}
              value={macroText}
              onChangeText={setMacroText}
              placeholder="e.g. pnpm build"
              placeholderTextColorClassName="accent-muted-foreground"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View className={styles.switchRow}>
              <Text className={styles.switchLabel}>Press Enter</Text>
              <Switch
                value={macroEnter}
                onValueChange={setMacroEnter}
                trackColorOffClassName="accent-secondary"
                trackColorOnClassName="accent-muted-foreground"
                thumbColorClassName="accent-foreground"
                ios_backgroundColorClassName="accent-secondary"
              />
            </View>
            <Pressable
              className={cn(styles.saveButton, !macroText.trim() && styles.saveButtonDisabled)}
              disabled={!macroText.trim()}
              onPress={handleMacroSave}
            >
              <Text
                className={cn(
                  styles.saveButtonText,
                  !macroText.trim() && styles.saveButtonTextDisabled
                )}
              >
                Add Shortcut
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </BottomDrawer>
  )
}

const styles = {
  header: cn('flex-row items-center pb-2'),
  backButton: cn('w-[30px] h-[30px] rounded-none items-center justify-center'),
  backButtonPressedActive: cn('active:bg-secondary'),
  backSpacer: cn('w-[30px]'),
  title: cn('flex-1 text-[15px] font-semibold text-foreground text-center'),
  group: cn('bg-card rounded-none overflow-hidden'),
  separator: cn('h-hairline bg-border mx-3'),
  row: cn('py-3 px-3.5'),
  rowPressedActive: cn('active:bg-secondary'),
  rowLabel: cn('text-[14px] font-medium text-foreground mb-[1px]'),
  rowHint: cn('text-[12px] text-muted-foreground/60'),
  shortcutForm: cn('pt-2'),
  preview: cn('flex-row items-center justify-center gap-2 py-5 flex-wrap'),
  previewKeycapRow: cn('flex-row items-center gap-2'),
  previewPlus: cn('text-muted-foreground/60 text-[16px]'),
  keycap: cn(
    'min-w-12 h-12 px-3 rounded-none bg-card border border-border items-center justify-center'
  ),
  keycapModifier: cn('min-w-0'),
  keycapWarn: cn('border-amber-500'),
  keycapText: cn('text-foreground font-mono text-[17px] font-semibold'),
  keycapTextWarn: cn('text-amber-500'),
  keycapModifierText: cn('text-muted-foreground font-mono text-[14px] font-semibold'),
  section: cn('mt-3'),
  sectionLabel: cn('text-[11px] text-muted-foreground/60 uppercase tracking-[0.8px] mb-2 pl-[2px]'),
  mods: cn('flex-row gap-2'),
  chip: cn('flex-1 h-10 rounded-none bg-card flex-row items-center justify-center gap-1'),
  chipSelected: cn('bg-foreground'),
  chipPressedActive: cn('active:bg-secondary'),
  chipText: cn('text-muted-foreground text-[14px] font-medium'),
  chipTextSelected: cn('text-background'),
  chipGlyph: cn('text-muted-foreground/60 text-[13px] font-mono'),
  chipGlyphSelected: cn('text-black/50'),
  keyInput: cn(
    'w-full h-14 rounded-none bg-card border border-border text-foreground font-mono text-[22px] font-semibold text-center'
  ),
  moreLink: cn('py-2 items-center'),
  moreLinkPressedActive: cn('active:opacity-[0.6]'),
  moreLinkText: cn('text-muted-foreground text-[13px] underline'),
  specialKeysForm: cn('pt-1 pb-3 gap-3'),
  specialGroup: cn('gap-1'),
  specialGroupTitle: cn(
    'text-[11px] text-muted-foreground/60 uppercase tracking-[0.8px] pl-[2px] mb-1'
  ),
  keyGrid: cn('flex-row flex-wrap mx-[-2px]'),
  keyCellWrap: cn('px-[2px] py-[2px]'),
  keyCell: cn('h-10 rounded-none bg-card items-center justify-center'),
  keyCellPressedActive: cn('active:bg-secondary'),
  keyCellSelected: cn('bg-foreground'),
  keyCellText: cn('text-[13px] font-semibold text-foreground font-mono'),
  keyCellTextSelected: cn('text-background'),
  macroForm: cn('p-3 gap-2'),
  fieldLabel: cn('text-[13px] font-medium text-muted-foreground'),
  fieldInput: cn(
    'bg-background text-foreground rounded-none px-3 py-2 text-[14px] font-mono border border-border'
  ),
  switchRow: cn('flex-row items-center justify-between py-1'),
  switchLabel: cn('text-[14px] text-foreground'),
  saveButton: cn('mt-3 bg-foreground py-3 rounded-none items-center'),
  saveButtonDisabled: cn('bg-secondary'),
  saveButtonText: cn('text-background text-[15px] font-semibold'),
  saveButtonTextDisabled: cn('text-muted-foreground/60')
} as const
