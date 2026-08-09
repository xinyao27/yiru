import Foundation

public func translate(_ key: String, fallback: String) -> String {
    Bundle.main.localizedString(forKey: key, value: fallback, table: nil)
}
