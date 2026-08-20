import SwiftUI

struct WorkspaceListToolbar: ToolbarContent {
    let model: WorkspaceListModel
    let isFloatingWorkspaceAvailable: Bool
    @Binding var isSearchPresented: Bool
    @Binding var isCreationPresented: Bool
    let leaveHost: (() -> Void)?
    let hideSidebar: (() -> Void)?
    let showAccounts: () -> Void
    let showFloatingWorkspace: () -> Void

    var body: some ToolbarContent {
        if let leaveHost {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: leaveHost) {
                    YiruToolbarIcon(.arrowLeft)
                }
                .accessibilityLabel("Back to hosts")
            }
        }
        // Why: each action gets its own circular glass target. Separate toolbar items avoid
        // SwiftUI's automatic grouped capsule, which changes both the width and the corner
        // geometry of this header.
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                isSearchPresented = true
            } label: {
                YiruToolbarIcon(.search)
            }
            .accessibilityLabel("Search workspaces")
        }
        ToolbarSpacer(.fixed, placement: .topBarTrailing)
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button {
                    isCreationPresented = true
                } label: {
                    Label("New workspace", iconID: .add)
                }
                .disabled(!model.canUseHost)
                if isFloatingWorkspaceAvailable {
                    Button(action: showFloatingWorkspace) {
                        Label("Floating Workspace", iconID: .terminal)
                    }
                    .disabled(!model.canUseHost)
                }
                Button(action: showAccounts) {
                    Label("Accounts", iconID: .account)
                }
                .disabled(!model.canUseHost)
                if model.showsReconnect {
                    Button {
                        Task { await model.reconnectAndLoad() }
                    } label: {
                        Label("Reconnect", iconID: .refresh)
                    }
                }
                if let hideSidebar {
                    Button(action: hideSidebar) {
                        Label("Hide sidebar", iconID: .sidebar)
                    }
                }
            } label: {
                YiruToolbarIcon(.more)
            }
            .accessibilityLabel("More actions")
        }
    }
}
