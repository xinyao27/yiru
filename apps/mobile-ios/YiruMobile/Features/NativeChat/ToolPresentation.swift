import Foundation

nonisolated func nativeChatToolSummary(_ blocks: [NativeChatBlock]) -> String {
    var edited: Set<String> = []
    var explored: Set<String> = []
    var searches = 0
    var commands = 0
    var other = 0
    var callIndex = 0

    for block in blocks {
        guard case .toolCall(let rawName, let input, _) = block else { continue }
        let name = normalizedToolName(rawName)
        let target = input.filePath ?? "call:\(callIndex)"
        callIndex += 1
        if editTools.contains(name) {
            edited.insert(target)
        } else if exploreTools.contains(name) {
            explored.insert(target)
        } else if searchTools.contains(name) {
            searches += 1
        } else if commandTools.contains(name) {
            commands += 1
        } else {
            other += 1
        }
    }

    var parts: [String] = []
    if !edited.isEmpty { parts.append("Edited \(fileCount(edited.count))") }
    if !explored.isEmpty {
        parts.append("\(parts.isEmpty ? "Explored" : "explored") \(fileCount(explored.count))")
    }
    if searches > 0 { parts.append("\(searches) \(searches == 1 ? "search" : "searches")") }
    if commands > 0 {
        parts.append(
            "\(parts.isEmpty ? "Ran" : "ran") \(commands) \(commands == 1 ? "command" : "commands")"
        )
    }
    if other > 0 { parts.append("\(other) other \(other == 1 ? "tool" : "tools")") }
    return parts.isEmpty ? String(localized: "Tool activity") : parts.joined(separator: ", ")
}

nonisolated private let editTools: Set<String> = [
    "applypatch", "create", "edit", "editfile", "multiedit", "multireplacefilecontent",
    "notebookedit", "patch", "replace", "replacefilecontent", "searchreplace", "write",
    "writefile", "writetofile",
]

nonisolated private let exploreTools: Set<String> = [
    "findbyname", "glob", "listdir", "read", "readfile", "readmanyfiles", "view", "viewfile",
]

nonisolated private let searchTools: Set<String> = [
    "googlewebsearch", "grep", "grepsearch", "searchfilecontent", "searchfiles", "searchweb",
    "sessionsearch", "websearch",
]

nonisolated private let commandTools: Set<String> = [
    "bash", "execute", "executecode", "execcommand", "powershell", "runcommand",
    "runshellcommand", "runterminalcmd", "runterminalcommand", "shellcommand", "terminal",
]

nonisolated private func normalizedToolName(_ value: String) -> String {
    let separators = CharacterSet(charactersIn: ".:/")
    let leaf =
        value.components(separatedBy: "__").last?
        .components(separatedBy: separators).last ?? value
    return leaf.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }
        .map(String.init).joined().lowercased()
}

nonisolated private func fileCount(_ count: Int) -> String {
    "\(count) \(count == 1 ? "file" : "files")"
}
