import Foundation

nonisolated struct NativeChatPermissionOption: Hashable, Sendable {
    let label: String
    let response: String
}

nonisolated private extension Array where Element == NativeChatField {
    func value(_ key: String) -> NativeChatValue? {
        first(where: { $0.key == key })?.value
    }

    func string(_ key: String) -> String? {
        guard case .string(let value) = value(key) else { return nil }
        return value
    }
}

nonisolated private extension NativeChatValue {
    var arrayValue: [NativeChatValue]? {
        guard case .array(let value) = self else { return nil }
        return value
    }

    var boolValue: Bool? {
        guard case .boolean(let value) = self else { return nil }
        return value
    }
}

nonisolated struct NativeChatPermissionPrompt: Hashable, Sendable {
    let title: String
    let detail: String?
    let options: [NativeChatPermissionOption]
}

nonisolated struct NativeChatChoicePrompt: Hashable, Sendable {
    let question: String
    let options: [String]
    let optionTokens: [String?]
    let isMultiple: Bool
}

nonisolated struct NativeChatAskOption: Hashable, Sendable {
    let label: String
    let detail: String?
}

nonisolated struct NativeChatAskQuestion: Hashable, Sendable {
    let question: String
    let header: String?
    let isMultiple: Bool
    let options: [NativeChatAskOption]
}

nonisolated struct NativeChatAskPrompt: Hashable, Sendable {
    let questions: [NativeChatAskQuestion]
}

nonisolated enum NativeChatInteractivePrompt: Hashable, Sendable {
    case ask(NativeChatAskPrompt)
    case permission(NativeChatPermissionPrompt)
    case choice(NativeChatChoicePrompt)
}

nonisolated enum NativeChatPromptParser {
    static func parse(
        _ status: NativeChatAgentStatus?,
        messages: [NativeChatMessage]
    ) -> NativeChatInteractivePrompt? {
        if let ask = parseAsk(status?.interactivePrompt) ?? extractPendingAsk(messages) {
            return .ask(ask)
        }
        guard let status else { return nil }
        guard status.isWaiting else {
            return parseApproval(status.interactivePrompt).map(
                NativeChatInteractivePrompt.permission)
        }
        if let permission = parsePermission(status.lastAssistantMessage) {
            return .permission(permission)
        }
        if let permission = parseApproval(status.interactivePrompt) {
            return .permission(permission)
        }
        return parseChoice(status.lastAssistantMessage).map(NativeChatInteractivePrompt.choice)
    }

    private static func extractPendingAsk(_ messages: [NativeChatMessage]) -> NativeChatAskPrompt? {
        var pending: NativeChatAskPrompt?
        var outstanding: [NativeChatAskPrompt?] = []
        for message in messages {
            for block in message.blocks {
                switch block {
                case .toolCall(_, let input, _):
                    let parsed = parseAsk(input)
                    if let parsed { pending = parsed }
                    outstanding.append(parsed)
                case .toolResult:
                    guard !outstanding.isEmpty else { continue }
                    let resolved = outstanding.removeFirst()
                    if resolved == pending { pending = nil }
                case .text, .image:
                    continue
                }
            }
        }
        return pending
    }

    private static func parseAsk(_ raw: String?) -> NativeChatAskPrompt? {
        guard let object = jsonObject(raw) as? [String: Any],
            let rows = object["questions"] as? [Any]
        else { return nil }
        let questions = rows.compactMap { value -> NativeChatAskQuestion? in
            guard let value = value as? [String: Any] else { return nil }
            let question = value["question"] as? String ?? ""
            let options = (value["options"] as? [Any] ?? []).compactMap(parseAskOption)
            guard !question.isEmpty || !options.isEmpty else { return nil }
            return NativeChatAskQuestion(
                question: question,
                header: value["header"] as? String,
                isMultiple: value["multiSelect"] as? Bool == true,
                options: options
            )
        }
        return questions.isEmpty ? nil : NativeChatAskPrompt(questions: questions)
    }

    private static func parseAsk(_ input: NativeChatValue) -> NativeChatAskPrompt? {
        guard case .object(let fields) = input,
            let questionsField = fields.first(where: { $0.key == "questions" }),
            case .array(let rows) = questionsField.value
        else { return nil }
        let questions = rows.compactMap { row -> NativeChatAskQuestion? in
            guard case .object(let fields) = row else { return nil }
            let question = fields.string("question") ?? ""
            let options = fields.value("options")?.arrayValue?.compactMap(parseAskOption) ?? []
            guard !question.isEmpty || !options.isEmpty else { return nil }
            return NativeChatAskQuestion(
                question: question,
                header: fields.string("header"),
                isMultiple: fields.value("multiSelect")?.boolValue == true,
                options: options
            )
        }
        return questions.isEmpty ? nil : NativeChatAskPrompt(questions: questions)
    }

    private static func parseAskOption(_ raw: NativeChatValue) -> NativeChatAskOption? {
        if case .string(let label) = raw {
            return NativeChatAskOption(label: label, detail: nil)
        }
        guard case .object(let fields) = raw, let label = fields.string("label") else {
            return nil
        }
        return NativeChatAskOption(label: label, detail: fields.string("description"))
    }

    private static func parseAskOption(_ raw: Any) -> NativeChatAskOption? {
        if let label = raw as? String { return NativeChatAskOption(label: label, detail: nil) }
        guard let value = raw as? [String: Any], let label = value["label"] as? String else {
            return nil
        }
        return NativeChatAskOption(label: label, detail: value["description"] as? String)
    }

    private static func parseApproval(_ raw: String?) -> NativeChatPermissionPrompt? {
        guard let root = jsonObject(raw) as? [String: Any],
            let approval = root["approval"] as? [String: Any],
            let tool = approval["tool"] as? String,
            !tool.isEmpty
        else { return nil }
        return NativeChatPermissionPrompt(
            title: String(localized: "Allow \(tool)?"),
            detail: approval["summary"] as? String,
            options: [
                NativeChatPermissionOption(label: String(localized: "Allow"), response: "1"),
                NativeChatPermissionOption(
                    label: String(localized: "Deny"), response: "\u{001B}"),
            ]
        )
    }

    private static func parsePermission(_ raw: String?) -> NativeChatPermissionPrompt? {
        guard let raw, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        let approvalWords =
            #"(?i)\b(permission|approve|approval|allow|deny|grant|authorize|confirm)\b|do you want to|would you like to|proceed\?|\(y/n\)|\by/n\b|yes/no|please confirm"#
        guard matches(approvalWords, in: raw) else { return nil }
        let numbered = captures(#"(?m)^\s*(\d+)[.)]\s*([^\n]+)"#, in: raw)
        let detail = raw.split(whereSeparator: \.isNewline).first.map {
            shortened(String($0), maximum: 160)
        }
        if numbered.count >= 2 {
            return NativeChatPermissionPrompt(
                title: String(localized: "Permission requested"),
                detail: detail,
                options: numbered.map {
                    NativeChatPermissionOption(
                        label: shortened($0[1], maximum: 40), response: $0[0])
                }
            )
        }
        var options = [
            NativeChatPermissionOption(label: String(localized: "Allow"), response: "y"),
            NativeChatPermissionOption(label: String(localized: "Deny"), response: "n"),
        ]
        if matches(
            #"(?i)\balways\b|don't ask again|do not ask again|for the rest|this session"#, in: raw)
        {
            options.insert(
                NativeChatPermissionOption(
                    label: String(localized: "Allow always"), response: "a"),
                at: 1
            )
        }
        return NativeChatPermissionPrompt(
            title: String(localized: "Permission requested"),
            detail: detail,
            options: options
        )
    }

    private static func parseChoice(_ raw: String?) -> NativeChatChoicePrompt? {
        guard let raw, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        let lines = raw.replacingOccurrences(of: "\r\n", with: "\n").split(
            separator: "\n", omittingEmptySubsequences: false
        ).map(String.init)
        var parsed: [(index: Int, token: String?, label: String)] = []
        for (index, line) in lines.enumerated() {
            if let option = parseChoiceLine(line) {
                parsed.append((index, option.token, option.label))
            }
        }
        guard let first = parsed.first else { return nil }
        var question = ""
        var isQuestionLine = false
        if first.index > 0 {
            for index in stride(from: first.index - 1, through: 0, by: -1) {
                let candidate = lines[index].trimmingCharacters(in: .whitespacesAndNewlines)
                guard !candidate.isEmpty, parseChoiceLine(candidate) == nil else { continue }
                question = candidate.hasSuffix(":") ? String(candidate.dropLast()) : candidate
                isQuestionLine = candidate.hasSuffix("?") || candidate.hasSuffix(":")
                break
            }
        }
        guard parsed.count >= 2 || isQuestionLine else { return nil }
        return NativeChatChoicePrompt(
            question: question.isEmpty ? String(localized: "Choose an option") : question,
            options: parsed.map(\.label),
            optionTokens: parsed.map(\.token),
            isMultiple: matches(
                #"(?i)select all|choose all|choose multiple|select multiple|pick multiple|all that apply|one or more|comma[- ]separated|multiple options"#,
                in: raw
            )
        )
    }

    private static func parseChoiceLine(_ source: String) -> (token: String?, label: String)? {
        let line = source.replacingOccurrences(
            of: #"^(\s*)(?:❯|›|»)\s+"#,
            with: "$1",
            options: .regularExpression
        )
        for pattern in [
            #"^\s*(\d{1,2})[.)]\s+(\S.*?)\s*$"#,
            #"^\s*\[([0-9a-zA-Z])\]\s+(\S.*?)\s*$"#,
            #"^\s*([a-zA-Z])[.)]\s+(\S.*?)\s*$"#,
        ] {
            if let match = captures(pattern, in: line).first {
                return (match[0], match[1])
            }
        }
        guard let bullet = captures(#"^\s*(?:[-*•>])\s+(\S.*?)\s*$"#, in: line).first else {
            return nil
        }
        return (nil, bullet[0])
    }

    private static func jsonObject(_ raw: String?) -> Any? {
        guard let raw, let data = raw.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }

    private static func matches(_ pattern: String, in text: String) -> Bool {
        text.range(of: pattern, options: .regularExpression) != nil
    }

    private static func captures(_ pattern: String, in text: String) -> [[String]] {
        guard let expression = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return expression.matches(in: text, range: range).map { match in
            (1..<match.numberOfRanges).compactMap { index in
                Range(match.range(at: index), in: text).map { String(text[$0]) }
            }
        }
    }

    private static func shortened(_ value: String, maximum: Int) -> String {
        let value = value.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        guard value.count > maximum else { return value }
        return String(value.prefix(maximum - 1)) + "…"
    }
}
