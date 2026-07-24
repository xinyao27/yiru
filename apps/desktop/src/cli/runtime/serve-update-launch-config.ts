import {
  SERVE_UPDATE_HANDOFF_PATH_ENV,
  getServeUpdateHandoffPath
} from '../../shared/serve-update-handoff'
import { getMacAppBundlePath } from './mac-app-update-bundle'

export function resolveServeUpdateHandoffLaunchPath(args: {
  executable: string
  recipeJson: boolean
  userDataPath: string
  platform?: NodeJS.Platform
}): string | null {
  if (args.recipeJson || !getMacAppBundlePath(args.executable, args.platform ?? process.platform)) {
    return null
  }
  return getServeUpdateHandoffPath(args.userDataPath)
}

export function buildServeUpdateChildEnvironment(
  base: NodeJS.ProcessEnv,
  handoffPath: string | null
): NodeJS.ProcessEnv {
  const next = { ...base }
  // Why: a recipe/direct launch must not inherit an ancestor's supervisor
  // claim; only this launcher's fresh IPC child receives the signal.
  delete next[SERVE_UPDATE_HANDOFF_PATH_ENV]
  if (handoffPath) {
    next[SERVE_UPDATE_HANDOFF_PATH_ENV] = handoffPath
  }
  return next
}
