import Foundation
import Security

private let maximumSecretBytes = 64 * 1024

private enum Operation: String {
  case read
  case write
  case delete
}

private func fail(_ message: String, status: Int32 = 1) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(status)
}

private func baseQuery(service: String, account: String) -> [String: Any] {
  [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
  ]
}

private func readSecret(service: String, account: String) {
  var query = baseQuery(service: service, account: account)
  query[kSecReturnData as String] = true
  query[kSecMatchLimit as String] = kSecMatchLimitOne
  var result: CFTypeRef?
  let status = SecItemCopyMatching(query as CFDictionary, &result)
  if status == errSecItemNotFound {
    exit(44)
  }
  guard status == errSecSuccess, let data = result as? Data else {
    fail("Keychain read failed (\(status)).")
  }
  FileHandle.standardOutput.write(data)
}

private func writeSecret(service: String, account: String) {
  let data = FileHandle.standardInput.readDataToEndOfFile()
  guard !data.isEmpty, data.count <= maximumSecretBytes else {
    fail("Keychain input must contain between 1 and \(maximumSecretBytes) bytes.")
  }
  let query = baseQuery(service: service, account: account)
  let update = [kSecValueData as String: data]
  let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
  if updateStatus == errSecSuccess {
    return
  }
  guard updateStatus == errSecItemNotFound else {
    fail("Keychain update failed (\(updateStatus)).")
  }
  var item = query
  item[kSecValueData as String] = data
  item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
  let addStatus = SecItemAdd(item as CFDictionary, nil)
  guard addStatus == errSecSuccess else {
    fail("Keychain write failed (\(addStatus)).")
  }
}

private func deleteSecret(service: String, account: String) {
  let status = SecItemDelete(baseQuery(service: service, account: account) as CFDictionary)
  guard status == errSecSuccess || status == errSecItemNotFound else {
    fail("Keychain delete failed (\(status)).")
  }
}

let arguments = CommandLine.arguments
guard
  arguments.count == 4,
  let operation = Operation(rawValue: arguments[1]),
  !arguments[2].isEmpty,
  !arguments[3].isEmpty,
  arguments[2].utf8.count <= 512,
  arguments[3].utf8.count <= 512
else {
  fail("Usage: yiru-machine-key <read|write|delete> <service> <account>")
}

switch operation {
case .read:
  readSecret(service: arguments[2], account: arguments[3])
case .write:
  writeSecret(service: arguments[2], account: arguments[3])
case .delete:
  deleteSecret(service: arguments[2], account: arguments[3])
}
