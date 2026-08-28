import type { DangerousApprovalService } from '../security/dangerous-approval'
import { daemonImplementation } from './contract'

export function createDangerousApprovalRouter(service: DangerousApprovalService) {
  return {
    beginApproval: daemonImplementation.dangerousApproval.beginApproval.handler(({ input }) =>
      service.beginApproval(input.operation)
    ),
    beginRegistration: daemonImplementation.dangerousApproval.beginRegistration.handler(() =>
      service.beginRegistration()
    ),
    finishApproval: daemonImplementation.dangerousApproval.finishApproval.handler(({ input }) =>
      service.finishApproval(input.requestId, input.operation, input)
    ),
    finishRegistration: daemonImplementation.dangerousApproval.finishRegistration.handler(
      ({ input }) => service.finishRegistration(input.requestId, input)
    ),
    remove: daemonImplementation.dangerousApproval.remove.handler(() => {
      service.consume('security.manage-passkey')
      return service.remove()
    }),
    status: daemonImplementation.dangerousApproval.status.handler(() => service.status())
  }
}
