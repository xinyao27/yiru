import Foundation

@available(macOS 13.0, *)
public struct PermissionFlowButtonState: Equatable, Sendable {
  public let titleKey: String
  public let systemImage: String
  public let isGranted: Bool

  public init(titleKey: String, systemImage: String, isGranted: Bool) {
    self.titleKey = titleKey
    self.systemImage = systemImage
    self.isGranted = isGranted
  }

  public static func make(from state: PermissionAuthorizationState) -> Self {
    switch state {
    case .granted:
      return .init(
        titleKey: "permission_flow.button.granted",
        systemImage: "checkmark.seal.fill",
        isGranted: true
      )
    case .notGranted:
      return .init(
        titleKey: "permission_flow.button.grant",
        systemImage: "arrow.right.circle.fill",
        isGranted: false
      )
    case .unknown:
      return .init(
        titleKey: "permission_flow.button.open",
        systemImage: "arrow.right.circle.fill",
        isGranted: false
      )
    case .checking:
      return .init(
        titleKey: "permission_flow.button.checking",
        systemImage: "clock",
        isGranted: false
      )
    }
  }
}
