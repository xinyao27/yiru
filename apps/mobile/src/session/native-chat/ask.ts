// Mobile and desktop share one parser/formatter so question-tool behavior cannot drift.
export {
  buildAskAnswerKeys,
  extractPendingAsk,
  formatAskAnswer,
  hasAskAnswer,
  parseAskFromStatus,
  registerQuestionTool,
  type AskAnswerKeyGroup,
  type AskAnswerSelection,
  type AskOption,
  type AskPrompt,
  type AskQuestion,
  type InteractiveQuestionParser
} from '@yiru/workbench-model/agent'
