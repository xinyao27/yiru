import { translate } from '@/i18n/i18n'

import type { MobileNetworkInterface } from '../settings/mobile-network-interface-selection'
import { HeroFlow, HeroIntro, HeroPaired, type PairedDevice } from './mobile-hero'
import type { StepIndex } from './mobile-hero'
import type { MobilePageStage } from './mobile-page-stage'
import { mobilePageStyles } from './mobile-page-tailwind'
import { MobilePageToolbar } from './mobile-page-toolbar'
import { getMobileReleaseLink, type MobilePlatform } from './mobile-release-link'
import { PhoneCarousel } from './phone-carousel'

type MobilePageContentProps = {
  closeMobilePage: () => void
  copyInstallUrl: () => void
  copyPairingCode: () => void
  devices: PairedDevice[]
  enterFlow: () => void
  generatePairing: (rotate: boolean) => void
  handleAddressChange: (address: string) => void
  handleBack: () => void
  handleContinue: () => void
  installQrUrl: string | null
  loadNetworkInterfaces: () => void
  networkInterfaces: MobileNetworkInterface[]
  openInstallUrl: () => void
  pairAnotherDevice: () => void
  pairLoading: boolean
  pairQrDataUrl: string | null
  pairingUrl: string | null
  platform: MobilePlatform
  refreshingNetworkInterfaces: boolean
  revokeDevice: (id: string) => void
  revokingDeviceIds: string[]
  selectedAddress: string | undefined
  onPlatformChange: (platform: MobilePlatform) => void
  showPairedDevices: (deviceCount: number) => void
  stage: MobilePageStage | null
  stepIdx: StepIndex
}

export function MobilePageContent({
  closeMobilePage,
  copyInstallUrl,
  copyPairingCode,
  devices,
  enterFlow,
  generatePairing,
  handleAddressChange,
  handleBack,
  handleContinue,
  installQrUrl,
  loadNetworkInterfaces,
  networkInterfaces,
  openInstallUrl,
  pairAnotherDevice,
  pairLoading,
  pairQrDataUrl,
  pairingUrl,
  platform,
  refreshingNetworkInterfaces,
  revokeDevice,
  revokingDeviceIds,
  selectedAddress,
  onPlatformChange,
  showPairedDevices,
  stage,
  stepIdx
}: MobilePageContentProps): React.JSX.Element {
  return (
    <div className={mobilePageStyles.root}>
      <MobilePageToolbar onClose={closeMobilePage} />
      <section className={mobilePageStyles.hero}>
        <div className={mobilePageStyles.heroCopy}>
          {stage === null ? null : stage === 'intro' ? (
            <HeroIntro onStart={enterFlow} />
          ) : stage === 'paired' ? (
            <HeroPaired
              devices={devices}
              onPairAnother={pairAnotherDevice}
              onRevoke={(id) => revokeDevice(id)}
              revokingDeviceIds={revokingDeviceIds}
            />
          ) : (
            <HeroFlow
              stepIdx={stepIdx}
              platform={platform}
              onPlatformChange={onPlatformChange}
              installQrUrl={installQrUrl}
              installCopy={getMobileReleaseLink(platform)}
              onOpenInstallUrl={openInstallUrl}
              onCopyInstallUrl={copyInstallUrl}
              pairQrDataUrl={pairQrDataUrl}
              pairingUrl={pairingUrl}
              pairLoading={pairLoading}
              onRegeneratePairing={() => generatePairing(true)}
              onCopyPairingCode={copyPairingCode}
              networkInterfaces={networkInterfaces}
              selectedAddress={selectedAddress}
              onSelectedAddressChange={handleAddressChange}
              onRefreshNetworkInterfaces={loadNetworkInterfaces}
              refreshingNetworkInterfaces={refreshingNetworkInterfaces}
              onBack={handleBack}
              onContinue={handleContinue}
              onDone={devices.length > 0 ? () => showPairedDevices(devices.length) : undefined}
            />
          )}
        </div>

        <div
          className={mobilePageStyles.stage}
          aria-label={translate('auto.components.mobile.MobilePage.e17393c6a3', 'Phone preview')}
        >
          <PhoneCarousel />
        </div>
      </section>
    </div>
  )
}
