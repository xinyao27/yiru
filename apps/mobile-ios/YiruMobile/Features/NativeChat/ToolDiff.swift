import Foundation

nonisolated enum NativeChatToolDiffLineKind: Sendable {
    case add
    case delete
    case context
    case metadata
}

nonisolated struct NativeChatToolDiffLine: Identifiable, Sendable {
    let id: Int
    let kind: NativeChatToolDiffLineKind
    let text: String
}

nonisolated enum NativeChatToolDiff {
    private static let editToolNames: Set<String> = [
        "Edit", "MultiEdit", "Write", "str_replace", "apply_patch",
    ]
    private static let maximumCharacters = 32_000

    static func fromToolCall(
        name: String,
        input: NativeChatValue,
        maximumLines: Int
    ) -> [NativeChatToolDiffLine]? {
        guard editToolNames.contains(name) else { return nil }
        let old = boundedLines(
            input.string(for: ["old_string", "oldString", "old"]),
            maximumLines: maximumLines
        )
        let new = boundedLines(
            input.string(for: ["new_string", "newString", "new", "content", "file_text"]),
            maximumLines: maximumLines
        )
        guard !old.lines.isEmpty || !new.lines.isEmpty else { return nil }
        var values: [(NativeChatToolDiffLineKind, String)] = []
        if let path = input.string(for: ["file_path", "path"]) {
            values.append((.metadata, path))
        }
        values += old.lines.map { (.delete, $0) }
        values += new.lines.map { (.add, $0) }
        return finalized(
            values,
            truncated: old.isTruncated || new.isTruncated,
            maximumLines: maximumLines
        )
    }

    static func fromText(_ text: String, maximumLines: Int) -> [NativeChatToolDiffLine]? {
        guard !text.isEmpty else { return nil }
        let bounded = boundedLines(text, maximumLines: maximumLines)
        var changedLineCount = 0
        let values: [(NativeChatToolDiffLineKind, String)] = bounded.lines.map { line in
            if line.hasPrefix("@@") || line.hasPrefix("diff ") || line.hasPrefix("index ") {
                return (.metadata, line)
            }
            if line.hasPrefix("+"), !line.hasPrefix("+++") {
                changedLineCount += 1
                return (.add, String(line.dropFirst()))
            }
            if line.hasPrefix("-"), !line.hasPrefix("---") {
                changedLineCount += 1
                return (.delete, String(line.dropFirst()))
            }
            return (.context, line)
        }
        guard changedLineCount >= 2 else { return nil }
        return finalized(
            values,
            truncated: bounded.isTruncated,
            maximumLines: maximumLines
        )
    }

    private static func boundedLines(_ value: String?, maximumLines: Int) -> (
        lines: [String], isTruncated: Bool
    ) {
        guard let value else { return ([], false) }
        let clipped = String(value.prefix(maximumCharacters))
        var lines = clipped.components(separatedBy: "\n")
        let isTruncated = value.count > maximumCharacters || lines.count > maximumLines
        lines = Array(lines.prefix(maximumLines))
        if !isTruncated, lines.last == "" { lines.removeLast() }
        return (lines, isTruncated)
    }

    private static func finalized(
        _ values: [(NativeChatToolDiffLineKind, String)],
        truncated: Bool,
        maximumLines: Int
    ) -> [NativeChatToolDiffLine] {
        var bounded = Array(values.prefix(maximumLines))
        if truncated || values.count > maximumLines {
            bounded = Array(bounded.prefix(max(0, maximumLines - 1)))
            bounded.append((.metadata, "… diff truncated …"))
        }
        return bounded.enumerated().map {
            NativeChatToolDiffLine(id: $0.offset, kind: $0.element.0, text: $0.element.1)
        }
    }
}
