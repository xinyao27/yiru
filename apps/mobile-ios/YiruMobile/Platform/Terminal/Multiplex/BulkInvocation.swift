import Foundation

nonisolated struct TerminalMultiplexInvocation: Encodable {
    let i: String
    let p: TerminalMultiplexInvocationPayload
}

nonisolated struct TerminalMultiplexInvocationPayload: Encodable {
    let u: String
    let b: TerminalMultiplexInvocationBody
    let h: [String: String]
}

nonisolated struct TerminalMultiplexInvocationBody: Encodable {
    let json: TerminalMultiplexInvocationInput
}

nonisolated struct TerminalMultiplexInvocationInput: Encodable {
    let bulkTicket: String
}

nonisolated struct TerminalMultiplexPeerMessage: Decodable {
    let i: String
    let t: Int?
    let p: TerminalMultiplexPeerPayload
}

nonisolated struct TerminalMultiplexPeerPayload: Decodable {
    let s: Int?
    let e: String?
    let d: TerminalMultiplexPeerEvent?
}

nonisolated struct TerminalMultiplexPeerEvent: Decodable {
    let json: TerminalMultiplexReadyEvent
}

nonisolated struct TerminalMultiplexReadyEvent: Decodable {
    let type: String
}
