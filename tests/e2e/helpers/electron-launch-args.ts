export function getYiruElectronLaunchArgs(mainPath: string, headful: boolean): string[] {
  if (headful || process.platform !== 'linux') {
    // Why: E2E locators assert the English accessibility contract and must not
    // inherit the developer or CI host locale.
    return ['--lang=en-US', mainPath]
  }

  // Why: Ubuntu CI can fail headless Electron when Chromium's GPU subprocess
  // cannot initialize; keep E2E on a low-process software path under Xvfb.
  return [
    '--lang=en-US',
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--in-process-gpu',
    mainPath
  ]
}
