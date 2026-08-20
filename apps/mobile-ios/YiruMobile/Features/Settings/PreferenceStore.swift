import Foundation
import Observation

@Observable
@MainActor
final class SettingsPreferences {
    private enum Key {
        static let theme = "yiru:themeMode:v1"
        static let loader = "yiru:loaderStyle"
        static let defaultSessionView = "yiru:defaultSessionView"
        static let terminalLinkMode = "yiru:terminalLinkOpenMode"
    }

    private(set) var themeMode: AppThemeMode
    private(set) var loaderStyle: AppLoaderStyle
    private(set) var defaultSessionView: DefaultSessionView
    private(set) var terminalLinkOpenMode: TerminalLinkOpenMode

    @ObservationIgnored
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        themeMode =
            defaults.string(forKey: Key.theme).flatMap(AppThemeMode.init(rawValue:)) ?? .system
        loaderStyle =
            defaults.string(forKey: Key.loader).flatMap(AppLoaderStyle.init(rawValue:)) ?? .s2
        defaultSessionView =
            defaults.string(forKey: Key.defaultSessionView).flatMap(
                DefaultSessionView.init(rawValue:))
            ?? .terminal
        terminalLinkOpenMode =
            defaults.string(forKey: Key.terminalLinkMode).flatMap(
                TerminalLinkOpenMode.init(rawValue:))
            ?? .yiruBrowser
    }

    func selectTheme(_ mode: AppThemeMode) {
        themeMode = mode
        defaults.set(mode.rawValue, forKey: Key.theme)
    }

    func selectLoader(_ style: AppLoaderStyle) {
        loaderStyle = style
        defaults.set(style.rawValue, forKey: Key.loader)
    }

    func selectDefaultSessionView(_ view: DefaultSessionView) {
        defaultSessionView = view
        defaults.set(view.rawValue, forKey: Key.defaultSessionView)
    }

    func selectTerminalLinkMode(_ mode: TerminalLinkOpenMode) {
        terminalLinkOpenMode = mode
        defaults.set(mode.rawValue, forKey: Key.terminalLinkMode)
    }
}
