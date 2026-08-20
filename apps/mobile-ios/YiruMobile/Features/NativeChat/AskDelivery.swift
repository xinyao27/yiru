import Foundation

nonisolated struct NativeChatAskSelection: Sendable {
    let indices: [Int]
    let other: String?
}

@MainActor
enum NativeChatAskDelivery {
    static func send(
        prompt: NativeChatAskPrompt,
        selections: [NativeChatAskSelection],
        agent: String?,
        write: (String, Bool) async -> Bool
    ) async -> Bool {
        guard !Task.isCancelled, hasAnswer(selections) else { return false }
        guard agent == "claude" || agent == "openclaude" else {
            let lines = prompt.questions.enumerated().map { index, question in
                labels(question: question, selection: selections[safe: index]).joined(
                    separator: ", ")
            }
            guard !Task.isCancelled else { return false }
            return await write(lines.joined(separator: "\n"), true)
        }
        let groups = claudeGroups(prompt: prompt, selections: selections)
        for (index, group) in groups.enumerated() {
            guard !Task.isCancelled else { return false }
            guard await write(group, false) else { return false }
            if index < groups.count - 1 {
                do {
                    try await Task.sleep(for: .seconds(1))
                } catch {
                    return false
                }
            }
        }
        return !groups.isEmpty
    }

    private static func claudeGroups(
        prompt: NativeChatAskPrompt,
        selections: [NativeChatAskSelection]
    ) -> [String] {
        var groups: [String] = []
        let isMultipleQuestions = prompt.questions.count > 1
        for (questionIndex, question) in prompt.questions.enumerated() {
            let selection = selections[safe: questionIndex]
            let other = selection?.other?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let otherIndex = String(question.options.count + 1)
            if question.isMultiple {
                for index in selection?.indices ?? [] { groups.append(String(index + 1)) }
                if !other.isEmpty {
                    groups.append(otherIndex)
                    groups.append(sanitize(other))
                    groups.append("\r")
                }
                groups.append("\u{001B}[C")
            } else if !other.isEmpty {
                groups.append(otherIndex)
                groups.append(
                    sanitize(
                        labels(question: question, selection: selection).joined(separator: ", ")))
                groups.append("\r")
            } else if let index = selection?.indices.first {
                groups.append(String(index + 1))
            } else if isMultipleQuestions {
                groups.append("\u{001B}[C")
            }
        }
        if isMultipleQuestions || prompt.questions.first?.isMultiple == true {
            if !groups.isEmpty { groups.append("\r") }
        }
        return groups
    }

    private static func labels(
        question: NativeChatAskQuestion,
        selection: NativeChatAskSelection?
    ) -> [String] {
        let selected = (selection?.indices ?? []).compactMap { index in
            question.options[safe: index]?.label
        }
        let other = selection?.other?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return other.isEmpty ? selected : selected + [other]
    }

    private static func sanitize(_ value: String) -> String {
        value.replacingOccurrences(of: #"[\r\n]+"#, with: " ", options: .regularExpression)
    }

    private static func hasAnswer(_ selections: [NativeChatAskSelection]) -> Bool {
        selections.contains {
            !$0.indices.isEmpty
                || !($0.other?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        }
    }
}

nonisolated private extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
