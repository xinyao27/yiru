import SwiftUI

private struct RetainedTerminalPaneState: View {
    @State private var model: TerminalLiveModel
    let preferences: TerminalPreferences
    let isVisible: Bool
    let showSettings: () -> Void

    init(
        host: HostProfile,
        target: TerminalTarget,
        runtime: any TerminalSessionRuntime,
        displayModeRuntime: any TerminalDisplayModeRuntime,
        surfaceFactory: any TerminalSurfaceFactory,
        preferences: TerminalPreferences,
        isVisible: Bool,
        showSettings: @escaping () -> Void
    ) {
        _model = State(
            initialValue: TerminalLiveModel(
                host: host,
                terminal: target,
                runtime: runtime,
                displayModeRuntime: displayModeRuntime,
                surfaceFactory: surfaceFactory,
                surfaceConfiguration: preferences.surfaceConfiguration
            )
        )
        self.preferences = preferences
        self.isVisible = isVisible
        self.showSettings = showSettings
    }

    var body: some View {
        TerminalLivePane(
            model: model,
            preferences: preferences,
            isVisible: isVisible,
            showSettings: showSettings
        )
    }
}

struct RetainedTerminalPane: View {
    let host: HostProfile
    let target: TerminalTarget
    let runtime: any TerminalSessionRuntime
    let displayModeRuntime: any TerminalDisplayModeRuntime
    let surfaceFactory: any TerminalSurfaceFactory
    let preferences: TerminalPreferences
    let isVisible: Bool
    let showSettings: () -> Void

    var body: some View {
        RetainedTerminalPaneState(
            host: host,
            target: target,
            runtime: runtime,
            displayModeRuntime: displayModeRuntime,
            surfaceFactory: surfaceFactory,
            preferences: preferences,
            isVisible: isVisible,
            showSettings: showSettings
        )
    }
}
