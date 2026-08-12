import SwiftUI

struct TerminalLiveView: View {
    @State private var model: TerminalLiveModel
    private let preferences: TerminalPreferences
    private let showSettings: () -> Void

    init(
        host: HostProfile,
        terminal: TerminalTarget,
        runtime: any TerminalSessionRuntime,
        displayModeRuntime: any TerminalDisplayModeRuntime,
        surfaceFactory: any TerminalSurfaceFactory,
        preferences: TerminalPreferences,
        showSettings: @escaping () -> Void
    ) {
        _model = State(
            initialValue: TerminalLiveModel(
                host: host,
                terminal: terminal,
                runtime: runtime,
                displayModeRuntime: displayModeRuntime,
                surfaceFactory: surfaceFactory,
                surfaceConfiguration: preferences.surfaceConfiguration
            )
        )
        self.preferences = preferences
        self.showSettings = showSettings
    }

    var body: some View {
        TerminalLivePane(
            model: model,
            preferences: preferences,
            isVisible: true,
            showSettings: showSettings
        )
        .navigationTitle(Text(model.title))
        .navigationBarTitleDisplayMode(.inline)
    }
}
