import {
  consumeRuntimeCodexRateLimitResetCredit,
  fetchRuntimeInactiveClaudeRateLimitAccounts,
  fetchRuntimeInactiveCodexRateLimitAccounts,
  getRuntimeGrokAccountStatus,
  handleAccountsSubscribe,
  listCachedRuntimeClaudeAccounts,
  listCachedRuntimeCodexAccounts,
  listRuntimeAccounts,
  refreshRuntimeClaudeRateLimitsForTarget,
  refreshRuntimeCodexRateLimitsForTarget,
  refreshRuntimeGrokRateLimits,
  refreshRuntimeRateLimits,
  removeRuntimeClaudeAccount,
  removeRuntimeCodexAccount,
  selectRuntimeClaudeAccount,
  selectRuntimeCodexAccount,
  unsubscribeRuntimeAccounts
} from '~main/runtime/rpc/methods/accounts'
import {
  markRuntimeRateLimitResumeFailed,
  markRuntimeRateLimitResumeFired,
  markRuntimeRateLimitResumeRendererReady,
  markRuntimeRateLimitResumeStale,
  cancelRuntimeRateLimitResume,
  listRuntimeRateLimitResumes,
  reportRuntimeRateLimitBanner,
  runRuntimeRateLimitResumeNow,
  scheduleRuntimeRateLimitResume
} from '~main/runtime/rpc/methods/rate-limit-resume'
import {
  acknowledgeRuntimeSkillUpdateRun,
  cancelRuntimeSkillUpdateRun,
  readRuntimeSkillDirFile,
  readRuntimeSkillFiles,
  readRuntimeSkillUpdateRun,
  readSkillFreshnessInventory,
  startRuntimeSkillInstallRun,
  startRuntimeSkillRemoveRun,
  startRuntimeSkillUpdateRun
} from '~main/runtime/rpc/methods/skill-manage'
import { handleSkillManageEventsSubscribe } from '~main/runtime/rpc/methods/skill-manage-events'
import { discoverRuntimeSkills } from '~main/runtime/rpc/methods/skills'
import {
  handleSpeechDictationCancel,
  handleSpeechDictationChunk,
  handleSpeechDictationFinish,
  handleSpeechDictationSetup,
  handleSpeechDictationStart,
  handleSpeechModelsDelete,
  handleSpeechModelsDownload,
  handleSpeechModelsList,
  handleSpeechOpenAiKeyClear,
  handleSpeechOpenAiKeyGetStatus,
  handleSpeechOpenAiKeySave
} from '~main/runtime/rpc/methods/speech'
import { handleSpeechEventsSubscribe } from '~main/runtime/rpc/methods/speech-events'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: accounts, rateLimitResume, skills, and speech are provider-facing
// tooling — coding-agent provider accounts and their rate limits, agent
// skill packages, and on-device speech models — grouped apart from
// workspace/session state they get invoked from.
export const providerToolingRuntimeHandlers = {
  accounts: {
    listCachedClaude: runtimeImplementation.accounts.listCachedClaude.handler(
      wireRuntimeMethod('accounts.listCachedClaude', listCachedRuntimeClaudeAccounts)
    ),
    listCachedCodex: runtimeImplementation.accounts.listCachedCodex.handler(
      wireRuntimeMethod('accounts.listCachedCodex', listCachedRuntimeCodexAccounts)
    ),
    list: runtimeImplementation.accounts.list.handler(
      wireRuntimeMethod('accounts.list', listRuntimeAccounts)
    ),
    subscribe: runtimeImplementation.accounts.subscribe.handler(
      wireRuntimeStream('accounts.subscribe', handleAccountsSubscribe)
    ),
    selectClaude: runtimeImplementation.accounts.selectClaude.handler(
      wireRuntimeMethod('accounts.selectClaude', selectRuntimeClaudeAccount)
    ),
    selectCodex: runtimeImplementation.accounts.selectCodex.handler(
      wireRuntimeMethod('accounts.selectCodex', selectRuntimeCodexAccount)
    ),
    removeClaude: runtimeImplementation.accounts.removeClaude.handler(
      wireRuntimeMethod('accounts.removeClaude', removeRuntimeClaudeAccount)
    ),
    removeCodex: runtimeImplementation.accounts.removeCodex.handler(
      wireRuntimeMethod('accounts.removeCodex', removeRuntimeCodexAccount)
    ),
    unsubscribe: runtimeImplementation.accounts.unsubscribe.handler(
      wireRuntimeMethod('accounts.unsubscribe', unsubscribeRuntimeAccounts)
    ),
    refresh: runtimeImplementation.accounts.refresh.handler(
      wireRuntimeMethod('accounts.refresh', refreshRuntimeRateLimits)
    ),
    refreshCodexForTarget: runtimeImplementation.accounts.refreshCodexForTarget.handler(
      wireRuntimeMethod('accounts.refreshCodexForTarget', refreshRuntimeCodexRateLimitsForTarget)
    ),
    refreshClaudeForTarget: runtimeImplementation.accounts.refreshClaudeForTarget.handler(
      wireRuntimeMethod('accounts.refreshClaudeForTarget', refreshRuntimeClaudeRateLimitsForTarget)
    ),
    consumeCodexResetCredit: runtimeImplementation.accounts.consumeCodexResetCredit.handler(
      wireRuntimeMethod('accounts.consumeCodexResetCredit', consumeRuntimeCodexRateLimitResetCredit)
    ),
    fetchInactiveClaudeAccounts: runtimeImplementation.accounts.fetchInactiveClaudeAccounts.handler(
      wireRuntimeMethod(
        'accounts.fetchInactiveClaudeAccounts',
        fetchRuntimeInactiveClaudeRateLimitAccounts
      )
    ),
    fetchInactiveCodexAccounts: runtimeImplementation.accounts.fetchInactiveCodexAccounts.handler(
      wireRuntimeMethod(
        'accounts.fetchInactiveCodexAccounts',
        fetchRuntimeInactiveCodexRateLimitAccounts
      )
    ),
    refreshGrok: runtimeImplementation.accounts.refreshGrok.handler(
      wireRuntimeMethod('accounts.refreshGrok', refreshRuntimeGrokRateLimits)
    ),
    grokStatus: runtimeImplementation.accounts.grokStatus.handler(
      wireRuntimeMethod('accounts.grokStatus', getRuntimeGrokAccountStatus)
    )
  },
  rateLimitResume: {
    report: runtimeImplementation.rateLimitResume.report.handler(
      wireRuntimeMethod('rateLimitResume.report', reportRuntimeRateLimitBanner)
    ),
    list: runtimeImplementation.rateLimitResume.list.handler(
      wireRuntimeMethod('rateLimitResume.list', listRuntimeRateLimitResumes)
    ),
    schedule: runtimeImplementation.rateLimitResume.schedule.handler(
      wireRuntimeMethod('rateLimitResume.schedule', scheduleRuntimeRateLimitResume)
    ),
    cancel: runtimeImplementation.rateLimitResume.cancel.handler(
      wireRuntimeMethod('rateLimitResume.cancel', cancelRuntimeRateLimitResume)
    ),
    runNow: runtimeImplementation.rateLimitResume.runNow.handler(
      wireRuntimeMethod('rateLimitResume.runNow', runRuntimeRateLimitResumeNow)
    ),
    markFired: runtimeImplementation.rateLimitResume.markFired.handler(
      wireRuntimeMethod('rateLimitResume.markFired', markRuntimeRateLimitResumeFired)
    ),
    markFailed: runtimeImplementation.rateLimitResume.markFailed.handler(
      wireRuntimeMethod('rateLimitResume.markFailed', markRuntimeRateLimitResumeFailed)
    ),
    markStale: runtimeImplementation.rateLimitResume.markStale.handler(
      wireRuntimeMethod('rateLimitResume.markStale', markRuntimeRateLimitResumeStale)
    ),
    rendererReady: runtimeImplementation.rateLimitResume.rendererReady.handler(
      wireRuntimeMethod('rateLimitResume.rendererReady', markRuntimeRateLimitResumeRendererReady)
    )
  },
  skills: {
    discover: runtimeImplementation.skills.discover.handler(
      wireRuntimeMethod('skills.discover', discoverRuntimeSkills)
    ),
    manage: {
      freshnessInventory: runtimeImplementation.skills.manage.freshnessInventory.handler(
        wireRuntimeMethod('skills.manage.freshnessInventory', readSkillFreshnessInventory)
      ),
      startUpdateRun: runtimeImplementation.skills.manage.startUpdateRun.handler(
        wireRuntimeMethod('skills.manage.startUpdateRun', startRuntimeSkillUpdateRun)
      ),
      startInstallRun: runtimeImplementation.skills.manage.startInstallRun.handler(
        wireRuntimeMethod('skills.manage.startInstallRun', startRuntimeSkillInstallRun)
      ),
      startRemoveRun: runtimeImplementation.skills.manage.startRemoveRun.handler(
        wireRuntimeMethod('skills.manage.startRemoveRun', startRuntimeSkillRemoveRun)
      ),
      listSkillFiles: runtimeImplementation.skills.manage.listSkillFiles.handler(
        wireRuntimeMethod('skills.manage.listSkillFiles', readRuntimeSkillFiles)
      ),
      readSkillDirFile: runtimeImplementation.skills.manage.readSkillDirFile.handler(
        wireRuntimeMethod('skills.manage.readSkillDirFile', readRuntimeSkillDirFile)
      ),
      cancelUpdateRun: runtimeImplementation.skills.manage.cancelUpdateRun.handler(
        wireRuntimeMethod('skills.manage.cancelUpdateRun', cancelRuntimeSkillUpdateRun)
      ),
      acknowledgeUpdateRun: runtimeImplementation.skills.manage.acknowledgeUpdateRun.handler(
        wireRuntimeMethod('skills.manage.acknowledgeUpdateRun', acknowledgeRuntimeSkillUpdateRun)
      ),
      getUpdateRun: runtimeImplementation.skills.manage.getUpdateRun.handler(
        wireRuntimeMethod('skills.manage.getUpdateRun', readRuntimeSkillUpdateRun)
      ),
      events: {
        subscribe: runtimeImplementation.skills.manage.events.subscribe.handler(
          wireRuntimeStream('skills.manage.events.subscribe', handleSkillManageEventsSubscribe)
        )
      }
    }
  },
  speech: {
    models: {
      list: runtimeImplementation.speech.models.list.handler(
        wireRuntimeMethod('speech.models.list', handleSpeechModelsList)
      ),
      download: runtimeImplementation.speech.models.download.handler(
        wireRuntimeMethod('speech.models.download', handleSpeechModelsDownload)
      ),
      delete: runtimeImplementation.speech.models.delete.handler(
        wireRuntimeMethod('speech.models.delete', handleSpeechModelsDelete)
      )
    },
    openaiKey: {
      getStatus: runtimeImplementation.speech.openaiKey.getStatus.handler(
        wireRuntimeMethod('speech.openaiKey.getStatus', handleSpeechOpenAiKeyGetStatus)
      ),
      save: runtimeImplementation.speech.openaiKey.save.handler(
        wireRuntimeMethod('speech.openaiKey.save', handleSpeechOpenAiKeySave)
      ),
      clear: runtimeImplementation.speech.openaiKey.clear.handler(
        wireRuntimeMethod('speech.openaiKey.clear', handleSpeechOpenAiKeyClear)
      )
    },
    dictation: {
      setup: runtimeImplementation.speech.dictation.setup.handler(
        wireRuntimeMethod('speech.dictation.setup', handleSpeechDictationSetup)
      ),
      start: runtimeImplementation.speech.dictation.start.handler(
        wireRuntimeMethod('speech.dictation.start', handleSpeechDictationStart)
      ),
      chunk: runtimeImplementation.speech.dictation.chunk.handler(
        wireRuntimeMethod('speech.dictation.chunk', handleSpeechDictationChunk)
      ),
      finish: runtimeImplementation.speech.dictation.finish.handler(
        wireRuntimeMethod('speech.dictation.finish', handleSpeechDictationFinish)
      ),
      cancel: runtimeImplementation.speech.dictation.cancel.handler(
        wireRuntimeMethod('speech.dictation.cancel', handleSpeechDictationCancel)
      )
    },
    events: {
      subscribe: runtimeImplementation.speech.events.subscribe.handler(
        wireRuntimeStream('speech.events.subscribe', handleSpeechEventsSubscribe)
      )
    }
  }
} as const
