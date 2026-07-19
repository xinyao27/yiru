import { discoverAndroidSdkFromHost } from './android-sdk-host-discovery'
import { EmulatorError } from '../emulator-errors'
import type { AndroidSdkPaths } from './android-sdk-discovery'

const SDK_MISSING = 'Android SDK not found. Install Android Studio and set ANDROID_HOME.'

// Re-run discovery on every call so a newly-installed SDK or changed configured
// path takes effect without a restart. Discovery is only a few existsSync probes.
export class AndroidSdkState {
  resolve(): AndroidSdkPaths | null {
    return discoverAndroidSdkFromHost()
  }

  require(): AndroidSdkPaths {
    const sdk = this.resolve()
    if (!sdk) {
      throw new EmulatorError('emulator_error', SDK_MISSING)
    }
    return sdk
  }
}
