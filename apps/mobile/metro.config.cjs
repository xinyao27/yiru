const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const sharedRoot = path.resolve(projectRoot, '..', 'desktop', 'src', 'shared')

const config = getDefaultConfig(projectRoot)

// Why: mobile source-control prompts use the same pure builders as desktop.
// Metro only watches the mobile app by default, so make the desktop protocol
// contracts visible until they become a standalone workspace package.
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), sharedRoot]))

module.exports = config
