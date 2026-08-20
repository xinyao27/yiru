import CryptoKit
import Foundation

nonisolated struct LegacyExpoAsyncStorage: Sendable {
    private static let formerBundleID = "com.xinyao27.yiru.mobile"
    private let values: [String: String]
    private let hasUnreadableValues: Bool

    var isComplete: Bool { !hasUnreadableValues }

    static func load(fileManager: FileManager = .default) -> LegacyExpoAsyncStorage? {
        let directories = storageDirectories(fileManager: fileManager)
            .filter { fileManager.fileExists(atPath: $0.path) }
            .sorted {
                modificationDate($0, fileManager: fileManager)
                    < modificationDate($1, fileManager: fileManager)
            }
        guard !directories.isEmpty else { return nil }

        var merged: [String: String] = [:]
        var didReadManifest = false
        var hasUnreadableValues = false
        for directory in directories {
            guard let manifest = readManifest(directory: directory) else { continue }
            didReadManifest = true
            for (key, storedValue) in manifest {
                if let inlineValue = storedValue as? String {
                    merged[key] = inlineValue
                } else if storedValue is NSNull {
                    if let fileValue = try? String(
                        contentsOf: directory.appending(path: hashedFileName(key)),
                        encoding: .utf8
                    ) {
                        merged[key] = fileValue
                    } else {
                        // Why: AsyncStorage writes larger values beside the manifest. A
                        // container move or interrupted restore can expose the manifest before
                        // its value file; keep the migration retryable instead of treating the
                        // missing value as an intentional nil.
                        hasUnreadableValues = true
                    }
                } else {
                    // Why: the legacy manifest contract is string-or-file-reference. An
                    // unexpected value is evidence that this container is only partially
                    // readable, so callers must not commit a one-shot migration marker.
                    hasUnreadableValues = true
                }
            }
        }
        return didReadManifest
            ? LegacyExpoAsyncStorage(
                values: merged,
                hasUnreadableValues: hasUnreadableValues
            )
            : nil
    }

    func value(forKey key: String) -> String? {
        values[key]
    }

    func values(withPrefix prefix: String) -> [(key: String, value: String)] {
        values.compactMap { key, value in
            key.hasPrefix(prefix) ? (key, value) : nil
        }
    }

    private static func storageDirectories(fileManager: FileManager) -> [URL] {
        let bundleIDs = Set([Bundle.main.bundleIdentifier, formerBundleID].compactMap { $0 })
        var directories: [URL] = []
        if let applicationSupport = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first {
            for bundleID in bundleIDs {
                directories.append(
                    applicationSupport
                        .appending(path: bundleID, directoryHint: .isDirectory)
                        .appending(path: "RCTAsyncLocalStorage_V1", directoryHint: .isDirectory)
                )
            }
        }
        if let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first {
            for name in [
                "RCTAsyncLocalStorage", "RNCAsyncLocalStorage_V1", "RCTAsyncLocalStorage_V1",
            ] {
                directories.append(documents.appending(path: name, directoryHint: .isDirectory))
            }
        }
        return Array(Set(directories))
    }

    private static func readManifest(directory: URL) -> [String: Any]? {
        let url = directory.appending(path: "manifest.json")
        guard let data = try? Data(contentsOf: url),
            let object = try? JSONSerialization.jsonObject(with: data),
            let manifest = object as? [String: Any]
        else { return nil }
        return manifest
    }

    private static func modificationDate(_ directory: URL, fileManager: FileManager) -> Date {
        let manifest = directory.appending(path: "manifest.json").path
        return (try? fileManager.attributesOfItem(atPath: manifest)[.modificationDate] as? Date)
            ?? .distantPast
    }

    private static func hashedFileName(_ key: String) -> String {
        Insecure.MD5.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
