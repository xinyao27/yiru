import type { CommandHandler } from '../dispatch'
import { ORCHESTRATION_DISPATCH_HANDLERS } from './orchestration-dispatch-handlers'
import { ORCHESTRATION_RUN_MESSAGE_HANDLERS } from './orchestration-run-message-handlers'
import { ORCHESTRATION_TASK_WORKER_HANDLERS } from './orchestration-task-worker-handlers'

export const ORCHESTRATION_HANDLERS: Record<string, CommandHandler> = {
  ...ORCHESTRATION_RUN_MESSAGE_HANDLERS,
  ...ORCHESTRATION_TASK_WORKER_HANDLERS,
  ...ORCHESTRATION_DISPATCH_HANDLERS
}
