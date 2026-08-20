import Foundation

nonisolated func linkifyNativeChatFilePaths(_ content: String) -> String {
    var fenceMarker: String?
    return content.split(separator: "\n", omittingEmptySubsequences: false).map { rawLine in
        let line = String(rawLine)
        if let marker = fenceMarker {
            if isClosingFence(line, marker: marker) { fenceMarker = nil }
            return line
        }
        if let marker = openingFence(line) {
            fenceMarker = marker
            return line
        }
        return linkifyInlinePaths(line)
    }.joined(separator: "\n")
}

nonisolated private let pathExtensions: Set<String> = [
    "astro", "bash", "c", "cc", "cfg", "cjs", "clj", "conf", "cpp", "cs", "css", "dart",
    "dockerfile", "env", "erl", "ex", "exs", "fish", "gitignore", "go", "gql", "gradle",
    "graphql", "h", "hpp", "htm", "html", "ini", "java", "js", "json", "jsonc", "jsx",
    "kt", "kts", "less", "lock", "lua", "markdown", "md", "mdx", "mjs", "npmrc", "php",
    "pl", "proto", "py", "r", "rb", "rs", "sass", "scala", "scss", "sh", "sql", "svelte",
    "svg", "swift", "toml", "ts", "tsx", "txt", "vue", "xml", "yaml", "yml", "zsh",
]

nonisolated private let pathCandidatePattern = try? NSRegularExpression(
    pattern:
        #"(?:[A-Za-z]:[\\/]|\\\\)?(?:\.{1,2}[\\/])?(?:[\w.@~+\-]+[\\/])+[\w.@+\-]+\.[A-Za-z0-9]+"#
)

nonisolated private let inlineTokenPattern = try? NSRegularExpression(
    pattern: #"(!?\[[^\]\n]*\]\([^)\n]+\)|(`+)([^`\n]+)\2|<[^>\n]+>|https?://[^\s<]+)"#
)

nonisolated private func linkifyInlinePaths(_ line: String) -> String {
    guard let inlineTokenPattern else { return line }
    let source = line as NSString
    let matches = inlineTokenPattern.matches(
        in: line,
        range: NSRange(location: 0, length: source.length)
    )
    var output = ""
    var cursor = 0
    for match in matches {
        output += linkifyPlainPaths(
            source.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
        )
        let token = source.substring(with: match.range)
        if match.range(at: 3).location != NSNotFound {
            let code = source.substring(with: match.range(at: 3))
            output += isFilePathCodeSpan(code) ? fileLink(label: token, path: code) : token
        } else {
            output += token
        }
        cursor = NSMaxRange(match.range)
    }
    output += linkifyPlainPaths(source.substring(from: cursor))
    return output
}

nonisolated private func linkifyPlainPaths(_ text: String) -> String {
    guard text.count <= 2_000, text.contains("."), let pathCandidatePattern else { return text }
    let source = text as NSString
    let matches = pathCandidatePattern.matches(
        in: text,
        range: NSRange(location: 0, length: source.length)
    )
    var output = ""
    var cursor = 0
    for match in matches {
        let candidate = source.substring(with: match.range)
        let previous =
            match.range.location > 0
            ? source.substring(with: NSRange(location: match.range.location - 1, length: 1)) : ""
        guard ![":", "/"].contains(previous),
            previous.rangeOfCharacter(from: .alphanumerics) == nil,
            previous != "_", previous != ".", previous != "@",
            isOpenablePath(candidate, requiresSeparator: true)
        else { continue }
        output += source.substring(
            with: NSRange(location: cursor, length: match.range.location - cursor)
        )
        output += fileLink(label: candidate, path: candidate)
        cursor = NSMaxRange(match.range)
    }
    output += source.substring(from: cursor)
    return output
}

nonisolated private func isFilePathCodeSpan(_ code: String) -> Bool {
    let value = code.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty, value.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else {
        return false
    }
    return isOpenablePath(value, requiresSeparator: false)
}

nonisolated private func isOpenablePath(_ candidate: String, requiresSeparator: Bool) -> Bool {
    guard !candidate.contains("://"),
        candidate.range(of: #"[^\\/]@"#, options: .regularExpression) == nil
    else {
        return false
    }
    let hasSeparator = candidate.contains("/") || candidate.contains("\\")
    guard !requiresSeparator || hasSeparator else {
        let leaf = candidate as NSString
        let dot = leaf.range(of: ".", options: .backwards).location
        guard dot > 0 else { return false }
        return pathExtensions.contains(leaf.substring(from: dot + 1).lowercased())
    }
    let last =
        candidate.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init)
        ?? candidate
    guard let dot = last.lastIndex(of: "."), dot != last.startIndex else { return false }
    return pathExtensions.contains(String(last[last.index(after: dot)...]).lowercased())
}

nonisolated private func fileLink(label: String, path: String) -> String {
    let normalized = path.replacingOccurrences(
        of: #"^\.[\\/]"#, with: "", options: .regularExpression)
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-_.!~*'()")
    let encoded = normalized.addingPercentEncoding(withAllowedCharacters: allowed) ?? normalized
    return "[\(label)](yiru-file://\(encoded))"
}

nonisolated private func openingFence(_ line: String) -> String? {
    let trimmed = line.drop(while: { $0 == " " || $0 == "\t" })
    guard line.count - trimmed.count <= 3, let first = trimmed.first,
        first == "`" || first == "~"
    else { return nil }
    let marker = String(trimmed.prefix(while: { $0 == first }))
    return marker.count >= 3 ? marker : nil
}

nonisolated private func isClosingFence(_ line: String, marker: String) -> Bool {
    let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count >= marker.count, let first = marker.first else { return false }
    return trimmed.allSatisfy { $0 == first }
}
