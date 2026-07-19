export function getYiruCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return 'yiru.cmd'
  }
  return 'yiru'
}
