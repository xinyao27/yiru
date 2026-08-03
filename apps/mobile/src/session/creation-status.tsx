import { ActivityIndicator, Text, View } from 'react-native'

import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassSurface } from '~/components/glass/surface'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { Warning as AlertTriangle } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { sessionScreenClassNames as styles } from './screen-class-names'

type MobileSessionCreationWarningProps = {
  message: string
  onDismiss: () => void
}

export function MobileSessionCreationWarning({
  message,
  onDismiss
}: MobileSessionCreationWarningProps): React.JSX.Element {
  return (
    <MobileGlassSurface
      className="mx-3 mt-2 flex-row items-start gap-2 rounded-xl px-3 py-2"
      isFunctional
    >
      <AlertTriangle size={16} colorClassName="accent-amber-500" />
      <Text className="text-foreground flex-1 text-xs leading-4">{message}</Text>
      <MobileGlassIconButton
        accessibilityLabel={translate(
          'mobile.session.workspaceWarning.dismiss',
          'Dismiss workspace creation warning'
        )}
        icon="close"
        onPress={onDismiss}
        size="small"
      />
    </MobileGlassSurface>
  )
}

type MobileSessionCreationPlaceholderProps = {
  createError: string
  disabled: boolean
  isCreating: boolean
  loading: boolean
  onCreateTab: () => void
}

export function MobileSessionCreationPlaceholder({
  createError,
  disabled,
  isCreating,
  loading,
  onCreateTab
}: MobileSessionCreationPlaceholderProps): React.JSX.Element {
  return (
    <View className={styles.emptyState}>
      {loading ? (
        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
      ) : (
        <>
          <Text className={styles.emptyText}>
            {translate('mobile.session.empty.noTabs', 'No tabs in this session')}
          </Text>
          {createError ? (
            <Text className="text-destructive mb-2 text-xs">{createError}</Text>
          ) : null}
          <View className="flex-row flex-wrap justify-center gap-2">
            <MobileGlassTextButton
              disabled={disabled}
              label={
                isCreating
                  ? translate('mobile.session.createTab.creating', 'Creating...')
                  : translate('mobile.session.createTab.action', 'Create Tab')
              }
              onPress={onCreateTab}
              size="large"
            />
          </View>
        </>
      )}
    </View>
  )
}
