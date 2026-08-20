import Hugeicons
import SwiftUI

public enum YiruComputerUseIconID: String, CaseIterable, Hashable, Sendable {
  case settings
  case close
  case drag
  case dragDirection
  case accessibility
  case screenshots
  case granted
  case forward
  case pending
  case checkmark

  fileprivate var asset: HugeiconsAsset {
    switch self {
    case .settings:
      Hugeicons.settings01
    case .close:
      Hugeicons.cancelCircle
    case .drag:
      Hugeicons.hand
    case .dragDirection:
      Hugeicons.arrowUp01
    case .accessibility:
      Hugeicons.accessibility
    case .screenshots:
      Hugeicons.camera01
    case .granted:
      Hugeicons.checkmarkBadge01
    case .forward:
      Hugeicons.circleArrowRight01
    case .pending:
      Hugeicons.clock01
    case .checkmark:
      Hugeicons.circleCheck
    }
  }

  @MainActor
  public func image() -> Image {
    asset.image()
  }
}

@MainActor
public struct YiruComputerUseIcon: View {
  private let icon: YiruComputerUseIconID
  private let size: CGFloat

  public init(_ icon: YiruComputerUseIconID, size: CGFloat = 18) {
    self.icon = icon
    self.size = size
  }

  public var body: some View {
    icon.image()
      .resizable()
      .scaledToFit()
      .frame(width: size, height: size)
  }
}
