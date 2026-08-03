import { Picker, Switch } from '@expo/ui'
import { cn } from 'cnfast'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { ExpoUiHost } from '~/components/expo-ui-host'
import { MobileSegmentedControl } from '~/components/segmented-control'
import { SettingsToggleRow } from '~/components/settings-toggle-row'
import { translate } from '~/i18n/translate'

type CatalogSegment = 'first' | 'second'

const CATALOG_SEGMENTS = [
  {
    label: translate('mobile.uiLab.nativeControls.segment.first', 'First'),
    value: 'first'
  },
  {
    label: translate('mobile.uiLab.nativeControls.segment.second', 'Second'),
    value: 'second'
  }
] as const

export function MobileUiLabNativeControlCatalog(): React.JSX.Element {
  const [isEnabled, setIsEnabled] = useState(false)
  const [pickerValue, setPickerValue] = useState('system')
  const [segment, setSegment] = useState<CatalogSegment>('first')

  return (
    <View className="mt-5">
      <Text className="text-foreground text-sm font-semibold">
        {translate('mobile.uiLab.nativeControls.title', 'Expo UI native controls')}
      </Text>
      <Text className="text-muted-foreground mt-1 text-xs leading-5">
        {translate(
          'mobile.uiLab.nativeControls.description',
          'Inspect theme, intrinsic sizing, long labels, disabled state, and accessibility.'
        )}
      </Text>

      <View className="border-border bg-card mt-3 gap-3 rounded-2xl border p-3">
        <View className="gap-3">
          <ExpoUiCatalogSwitchRow
            label={translate('mobile.uiLab.nativeControls.switch.label', 'Native switch')}
            onValueChange={setIsEnabled}
            value={isEnabled}
          />
          <ExpoUiCatalogSwitchRow
            disabled
            label={translate(
              'mobile.uiLab.nativeControls.longSwitch.label',
              'Disabled switch with a deliberately long label for layout inspection'
            )}
            onValueChange={() => {}}
            value
          />
          <ExpoUiHost layout="fill">
            <Picker selectedValue={pickerValue} onValueChange={setPickerValue}>
              <Picker.Item
                label={translate('mobile.uiLab.nativeControls.picker.system', 'System')}
                value="system"
              />
              <Picker.Item
                label={translate('mobile.uiLab.nativeControls.picker.alternate', 'Alternate')}
                value="alternate"
              />
            </Picker>
          </ExpoUiHost>
        </View>

        <View className="border-border -mx-3 border-y">
          <SettingsToggleRow
            label={translate(
              'mobile.uiLab.nativeControls.toggleRow.label',
              'Accessible product toggle row'
            )}
            onValueChange={setIsEnabled}
            supportingText={translate(
              'mobile.uiLab.nativeControls.toggleRow.supportingText',
              'The complete row owns its label, state, and interaction target.'
            )}
            value={isEnabled}
          />
          <SettingsToggleRow
            disabled
            label={translate(
              'mobile.uiLab.nativeControls.disabledToggleRow.label',
              'Disabled product toggle row with a long localized label'
            )}
            onValueChange={() => {}}
            value
          />
        </View>

        <MobileSegmentedControl
          accessibilityLabel={translate(
            'mobile.uiLab.nativeControls.segment.label',
            'Native segment preview'
          )}
          onChange={setSegment}
          options={CATALOG_SEGMENTS}
          value={segment}
        />
      </View>
    </View>
  )
}

type ExpoUiCatalogSwitchRowProps = {
  disabled?: boolean
  label: string
  onValueChange: (value: boolean) => void
  value: boolean
}

function ExpoUiCatalogSwitchRow({
  disabled = false,
  label,
  onValueChange,
  value
}: ExpoUiCatalogSwitchRowProps): React.JSX.Element {
  return (
    <Pressable
      accessible
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      className="min-h-11 flex-row items-center gap-3"
      disabled={disabled}
      onPress={() => onValueChange(!value)}
    >
      <Text className={cn('text-foreground min-w-0 flex-1 text-base', disabled && 'opacity-50')}>
        {label}
      </Text>
      <View
        accessibilityElementsHidden
        className={disabled ? 'opacity-50' : undefined}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <ExpoUiHost>
          <Switch disabled={disabled} onValueChange={onValueChange} value={value} />
        </ExpoUiHost>
      </View>
    </Pressable>
  )
}
