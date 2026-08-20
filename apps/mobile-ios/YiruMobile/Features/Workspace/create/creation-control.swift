import SwiftUI

private struct WorkspaceCreationControl: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 14))
            .foregroundStyle(Theme.Colors.foreground)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 12))
    }
}

extension View {
    func workspaceCreationControl() -> some View {
        modifier(WorkspaceCreationControl())
    }
}
