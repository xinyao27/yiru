import type { ImageSourcePropType } from 'react-native'

import type { TuiAgent } from '../../../desktop/src/shared/types'

// Why: mobile previously rendered these agent icons from Google's favicon
// service, which is unreachable in some regions (e.g. mainland China) and
// offline, leaving broken images in the agent picker (#8451). Bundle each
// favicon so Metro packages it into the app and the icon renders without any
// network request. The PNGs are shared with desktop in src/shared/agent-icons
// (Metro watches src/shared via metro.config.cjs sharedRoot). Metro requires
// static literal require() paths, so keep this as an explicit map rather than
// building the path from the agent id.
export const MOBILE_AGENT_ICON_ASSETS: Partial<Record<TuiAgent, ImageSourcePropType>> = {
  openclaude: require('../../../desktop/src/shared/agent-icons/openclaude.png'),
  grok: require('../../../desktop/src/shared/agent-icons/grok.png'),
  copilot: require('../../../desktop/src/shared/agent-icons/copilot.png'),
  opencode: require('../../../desktop/src/shared/agent-icons/opencode.png'),
  'mimo-code': require('../../../desktop/src/shared/agent-icons/mimo-code.png'),
  ante: require('../../../desktop/src/shared/agent-icons/ante.png'),
  gemini: require('../../../desktop/src/shared/agent-icons/gemini.png'),
  antigravity: require('../../../desktop/src/shared/agent-icons/antigravity.png'),
  goose: require('../../../desktop/src/shared/agent-icons/goose.png'),
  amp: require('../../../desktop/src/shared/agent-icons/amp.png'),
  kilo: require('../../../desktop/src/shared/agent-icons/kilo.png'),
  kiro: require('../../../desktop/src/shared/agent-icons/kiro.png'),
  crush: require('../../../desktop/src/shared/agent-icons/crush.png'),
  aug: require('../../../desktop/src/shared/agent-icons/aug.png'),
  autohand: require('../../../desktop/src/shared/agent-icons/autohand.png'),
  cline: require('../../../desktop/src/shared/agent-icons/cline.png'),
  codebuff: require('../../../desktop/src/shared/agent-icons/codebuff.png'),
  'command-code': require('../../../desktop/src/shared/agent-icons/command-code.png'),
  continue: require('../../../desktop/src/shared/agent-icons/continue.png'),
  cursor: require('../../../desktop/src/shared/agent-icons/cursor.png'),
  droid: require('../../../desktop/src/shared/agent-icons/droid.png'),
  kimi: require('../../../desktop/src/shared/agent-icons/kimi.png'),
  'mistral-vibe': require('../../../desktop/src/shared/agent-icons/mistral-vibe.png'),
  'qwen-code': require('../../../desktop/src/shared/agent-icons/qwen-code.png'),
  rovo: require('../../../desktop/src/shared/agent-icons/rovo.png'),
  hermes: require('../../../desktop/src/shared/agent-icons/hermes.png'),
  devin: require('../../../desktop/src/shared/agent-icons/devin.png'),
  openclaw: require('../../../desktop/src/shared/agent-icons/openclaw.png')
}
