import { Column, Picker, Switch } from '@expo/ui'
import { useState } from 'react'
import { Text, View } from 'react-native'

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
        <ExpoUiHost layout="fill">
          <Column spacing={12}>
            <Switch
              label={translate('mobile.uiLab.nativeControls.switch.label', 'Native switch')}
              onValueChange={setIsEnabled}
              value={isEnabled}
            />
            <Switch
              disabled
              label={translate(
                'mobile.uiLab.nativeControls.longSwitch.label',
                'Disabled switch with a deliberately long label for layout inspection'
              )}
              onValueChange={() => {}}
              value
            />
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
          </Column>
        </ExpoUiHost>

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
