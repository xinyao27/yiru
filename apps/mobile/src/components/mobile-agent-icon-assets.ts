import type { TuiAgent } from '@yiru/workbench-model/agent'
import type { ImageSourcePropType } from 'react-native'

// Why: mobile previously rendered these agent icons from Google's favicon
// service, which is unreachable in some regions (e.g. mainland China) and
// offline, leaving broken images in the agent picker (#8451). Bundle each
// favicon so Metro packages it into the app and the icon renders without any
// network request. The PNGs are shared with desktop in src/shared/agent-icons
// (Metro watches src/shared via metro.config.cjs sharedRoot). Metro requires
// static literal require() paths, so keep this as an explicit map rather than
// building the path from the agent id.
export const MOBILE_AGENT_ICON_ASSETS: Partial<Record<TuiAgent, ImageSourcePropType>> = {
  openclaude: require('../../assets/agent-icons/openclaude.png'),
  grok: require('../../assets/agent-icons/grok.png'),
  copilot: require('../../assets/agent-icons/copilot.png'),
  opencode: require('../../assets/agent-icons/opencode.png'),
  'mimo-code': require('../../assets/agent-icons/mimo-code.png'),
  ante: require('../../assets/agent-icons/ante.png'),
  gemini: require('../../assets/agent-icons/gemini.png'),
  antigravity: require('../../assets/agent-icons/antigravity.png'),
  goose: require('../../assets/agent-icons/goose.png'),
  amp: require('../../assets/agent-icons/amp.png'),
  kilo: require('../../assets/agent-icons/kilo.png'),
  kiro: require('../../assets/agent-icons/kiro.png'),
  crush: require('../../assets/agent-icons/crush.png'),
  aug: require('../../assets/agent-icons/aug.png'),
  autohand: require('../../assets/agent-icons/autohand.png'),
  cline: require('../../assets/agent-icons/cline.png'),
  codebuff: require('../../assets/agent-icons/codebuff.png'),
  'command-code': require('../../assets/agent-icons/command-code.png'),
  continue: require('../../assets/agent-icons/continue.png'),
  cursor: require('../../assets/agent-icons/cursor.png'),
  droid: require('../../assets/agent-icons/droid.png'),
  kimi: require('../../assets/agent-icons/kimi.png'),
  'mistral-vibe': require('../../assets/agent-icons/mistral-vibe.png'),
  'qwen-code': require('../../assets/agent-icons/qwen-code.png'),
  rovo: require('../../assets/agent-icons/rovo.png'),
  hermes: require('../../assets/agent-icons/hermes.png'),
  devin: require('../../assets/agent-icons/devin.png'),
  openclaw: require('../../assets/agent-icons/openclaw.png')
}
