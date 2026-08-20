import Foundation

@MainActor
extension AppModel {
    func handleDevelopmentPairingLaunchIfNeeded() {
        #if DEBUG && targetEnvironment(simulator)
            guard !didHandleDevelopmentPairingLaunch,
                ProcessInfo.processInfo.arguments.contains("--development-auto-pair"),
                let value = developmentPairingURL,
                let url = URL(string: value),
                url.scheme?.lowercased() == "yiru"
            else { return }
            didHandleDevelopmentPairingLaunch = true
            handleOpenURL(url)
        #endif
    }

    #if DEBUG && targetEnvironment(simulator)
        private var developmentPairingURL: String? {
            let prefix = "--development-auto-pair-url="
            if let argument = ProcessInfo.processInfo.arguments.first(where: {
                $0.hasPrefix(prefix)
            }) {
                return String(argument.dropFirst(prefix.count))
            }
            return ProcessInfo.processInfo.environment["YIRU_DEVELOPMENT_PAIRING_URL"]
        }
    #endif
}
