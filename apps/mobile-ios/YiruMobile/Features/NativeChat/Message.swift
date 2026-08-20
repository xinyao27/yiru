import Foundation

nonisolated enum NativeChatRole: String, Hashable, Sendable {
    case user
    case assistant
    case tool
    case reasoning
    case system
}

nonisolated enum NativeChatSource: String, Hashable, Sendable {
    case transcript
    case hook
    case scrape

    var priority: Int {
        switch self {
        case .transcript: 3
        case .hook: 2
        case .scrape: 1
        }
    }
}

nonisolated enum NativeChatBlock: Hashable, Sendable {
    case text(String)
    case toolCall(name: String, input: NativeChatValue, callID: String?)
    case toolResult(output: String, isError: Bool, callID: String?, segments: [String]?)
    case image(path: String?, url: String?, alt: String?)
}

nonisolated indirect enum NativeChatValue: Hashable, Sendable {
    case null
    case boolean(Bool)
    case number(Double)
    case string(String)
    case array([NativeChatValue])
    case object([NativeChatField])

    init(wire: MobileJSONValueWire) {
        switch wire {
        case .null: self = .null
        case .boolean(let value): self = .boolean(value)
        case .number(let value): self = .number(value)
        case .string(let value): self = .string(value)
        case .array(let values): self = .array(values.map(NativeChatValue.init(wire:)))
        case .object(let values):
            self = .object(
                values.map { NativeChatField(key: $0.key, value: .init(wire: $0.value)) }
                    .sorted { $0.key < $1.key }
            )
        }
    }

    var formatted: String {
        if case .string(let value) = self { return value }
        return render(level: 0, pretty: true)
    }

    var summary: String {
        let raw: String
        if case .string(let value) = self {
            raw = value
        } else {
            raw = render(level: 0, pretty: false)
        }
        let collapsed =
            raw
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        return collapsed.count <= 80 ? collapsed : String(collapsed.prefix(79)) + "…"
    }

    var filePath: String? {
        guard case .object(let fields) = self else { return nil }
        for key in ["file_path", "filePath", "path", "notebook_path"] {
            guard let field = fields.first(where: { $0.key == key }),
                case .string(let value) = field.value,
                !value.isEmpty
            else { continue }
            return value
        }
        return nil
    }

    func string(for keys: [String]) -> String? {
        guard case .object(let fields) = self else { return nil }
        for key in keys {
            guard let field = fields.first(where: { $0.key == key }),
                case .string(let value) = field.value
            else { continue }
            return value
        }
        return nil
    }

    private func render(level: Int, pretty: Bool) -> String {
        switch self {
        case .null: "null"
        case .boolean(let value): value ? "true" : "false"
        case .number(let value):
            value.rounded() == value ? String(Int64(value)) : String(value)
        case .string(let value):
            encodedJSONString(value)
        case .array(let values):
            renderCollection(
                values.map { $0.render(level: level + 1, pretty: pretty) },
                open: "[",
                close: "]",
                level: level,
                pretty: pretty
            )
        case .object(let fields):
            renderCollection(
                fields.map {
                    let key = encodedJSONString($0.key)
                    return
                        "\(key):\(pretty ? " " : "")\($0.value.render(level: level + 1, pretty: pretty))"
                },
                open: "{",
                close: "}",
                level: level,
                pretty: pretty
            )
        }
    }

    private func renderCollection(
        _ values: [String],
        open: String,
        close: String,
        level: Int,
        pretty: Bool
    ) -> String {
        guard !values.isEmpty else { return open + close }
        guard pretty else { return open + values.joined(separator: ",") + close }
        let indent = String(repeating: "  ", count: level + 1)
        let closingIndent = String(repeating: "  ", count: level)
        return open + "\n" + indent + values.joined(separator: ",\n" + indent)
            + "\n" + closingIndent + close
    }
}

nonisolated private func encodedJSONString(_ value: String) -> String {
    guard let data = try? JSONEncoder().encode(value) else { return "\"\"" }
    return String(data: data, encoding: .utf8) ?? "\"\""
}

nonisolated struct NativeChatField: Hashable, Sendable {
    let key: String
    let value: NativeChatValue
}

nonisolated struct NativeChatMessage: Identifiable, Hashable, Sendable {
    let id: String
    let role: NativeChatRole
    let blocks: [NativeChatBlock]
    let timestamp: Date?
    let source: NativeChatSource
    let turnID: String?

    var plainText: String {
        blocks.compactMap { block in
            switch block {
            case .text(let text): text
            case .toolCall, .toolResult, .image: nil
            }
        }.joined(separator: "\n")
    }
}

nonisolated enum NativeChatFrame: Sendable {
    case snapshot(messages: [NativeChatMessage], hasMore: Bool, beforeOffset: Int?, error: String?)
    case replacement(messages: [NativeChatMessage], hasMore: Bool, beforeOffset: Int?)
    case appended([NativeChatMessage])
    case end
}

nonisolated struct NativeChatPage: Sendable {
    let messages: [NativeChatMessage]
    let hasMore: Bool
    let beforeOffset: Int?
}
