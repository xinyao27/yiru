import { submitFeedback } from '~main/feedback/submit'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'

export function createBunShellFeedbackHandlers() {
  return {
    feedback: {
      submit: runtimeImplementation.shell.feedback.submit.handler(({ input }) =>
        submitFeedback(input)
      )
    }
  }
}
