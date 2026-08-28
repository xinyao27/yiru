import CryptoKit
import Foundation
import UserNotifications

final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var fallbackContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        let content = request.content.mutableCopy() as? UNMutableNotificationContent
        fallbackContent = content
        guard let content else {
            finish(request.content)
            return
        }
        do {
            let decrypted = try decrypt(userInfo: content.userInfo)
            content.title = decrypted.payload.title
            content.body = decrypted.payload.body
            content.userInfo["source"] = "remote"
            content.userInfo["hostId"] = decrypted.hostID
            content.userInfo["worktreeId"] = decrypted.payload.worktreeID
            content.userInfo["notificationId"] = decrypted.payload.notificationID
        } catch {
            // Why: the generic APNs alert contains no session detail and remains safe when the
            // Keychain is unavailable before first unlock or a stale push arrives after unpairing.
        }
        finish(content)
    }

    override func serviceExtensionTimeWillExpire() {
        guard let fallbackContent else { return }
        finish(fallbackContent)
    }

    private func decrypt(userInfo: [AnyHashable: Any]) throws -> DecryptedNotification {
        guard let envelope = userInfo["yiru"] as? [String: Any],
            let keyID = envelope["keyId"] as? String,
            let nonceData = base64URLData(envelope["nonce"]),
            let combined = base64URLData(envelope["ciphertext"]),
            combined.count >= 16,
            let credential = try NotificationPushCredentialStore.credential(keyID: keyID),
            let keyData = Data(base64Encoded: credential.keyBase64)
        else {
            throw NotificationServiceError.invalidEnvelope
        }
        let nonce = try AES.GCM.Nonce(data: nonceData)
        let ciphertext = combined.dropLast(16)
        let tag = combined.suffix(16)
        let box = try AES.GCM.SealedBox(nonce: nonce, ciphertext: ciphertext, tag: tag)
        let plaintext = try AES.GCM.open(
            box,
            using: SymmetricKey(data: keyData),
            authenticating: Data("yiru-apns-v1\0\(keyID)".utf8)
        )
        let payload = try JSONDecoder().decode(NotificationPayload.self, from: plaintext)
        guard payload.v == 1 else { throw NotificationServiceError.invalidEnvelope }
        return DecryptedNotification(
            hostID: credential.hostID,
            payload: payload
        )
    }

    private func finish(_ content: UNNotificationContent) {
        guard let contentHandler else { return }
        self.contentHandler = nil
        fallbackContent = nil
        contentHandler(content)
    }
}

private struct DecryptedNotification {
    let hostID: String
    let payload: NotificationPayload
}

private struct NotificationPayload: Decodable {
    let body: String
    let notificationID: String
    let title: String
    let v: Int
    let worktreeID: String

    private enum CodingKeys: String, CodingKey {
        case body
        case notificationID = "notificationId"
        case title
        case v
        case worktreeID = "worktreeId"
    }
}

private enum NotificationServiceError: Error {
    case invalidEnvelope
}

private func base64URLData(_ value: Any?) -> Data? {
    guard let value = value as? String else { return nil }
    var encoded = value.replacingOccurrences(of: "-", with: "+")
        .replacingOccurrences(of: "_", with: "/")
    encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
    return Data(base64Encoded: encoded)
}
