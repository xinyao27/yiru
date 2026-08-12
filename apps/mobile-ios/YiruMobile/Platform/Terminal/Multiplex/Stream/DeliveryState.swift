import Foundation

actor TerminalMultiplexDeliveryState {
    private let routeID: UInt32
    private let bulk: TerminalBulkConnection
    private let delivery: TerminalMultiplexDelivery
    private var appState = TerminalSessionAppState.foreground
    private var subscribedAppState = TerminalSessionAppState.foreground
    private var pendingRevealStateVersion: UInt32?

    init(
        routeID: UInt32,
        bulk: TerminalBulkConnection,
        delivery: TerminalMultiplexDelivery
    ) {
        self.routeID = routeID
        self.bulk = bulk
        self.delivery = delivery
    }

    func transition(to state: TerminalSessionAppState, isSubscribed: Bool) async throws {
        guard state != appState else { return }
        appState = state
        switch state {
        case .foreground:
            await bulk.setAppState(.foreground)
            if isSubscribed {
                try await apply(.foreground)
            }
        case .background:
            if isSubscribed {
                try await apply(.background)
            }
            await bulk.setAppState(.background)
        }
    }

    func prepareSubscription() -> TerminalSessionAppState {
        subscribedAppState = appState
        return appState
    }

    func reconcileAfterSubscription() async throws {
        if subscribedAppState != appState {
            try await apply(appState)
        }
    }

    func handleAcknowledgement(_ frame: TerminalMultiplexFrame) async throws -> Bool {
        guard let record = TerminalMultiplexFlowRecordCodec.decodeAck(frame.payload),
            record.cumulativeSequence == frame.sequence
        else {
            throw TerminalMultiplexSessionError.invalidAcknowledgement
        }
        guard record.kind == 3 else { return false }
        guard record.status == 0, frame.correlationID != 0 else {
            throw TerminalMultiplexSessionError.invalidAcknowledgement
        }
        guard frame.correlationID == pendingRevealStateVersion else { return true }
        let stateVersion = frame.correlationID
        pendingRevealStateVersion = nil
        try await delivery.beginReveal()
        let payload = try JSONEncoder().encode(
            TerminalMultiplexRevealRecord(stateVersion: stateVersion)
        )
        try await send(
            opcode: .revealSnapshot,
            sequence: await delivery.currentParsedSequence(),
            correlationID: try await bulk.allocateCorrelationID(),
            payload: payload
        )
        return true
    }

    private func apply(_ state: TerminalSessionAppState) async throws {
        subscribedAppState = state
        switch state {
        case .foreground:
            pendingRevealStateVersion = try await sendVisibility(
                isVisible: true,
                hasDeliveryInterest: true,
                priority: 2
            )
        case .background:
            pendingRevealStateVersion = nil
            _ = try await sendVisibility(
                isVisible: false,
                hasDeliveryInterest: false,
                priority: 0
            )
            try await delivery.suspendDelivery()
        }
    }

    private func sendVisibility(
        isVisible: Bool,
        hasDeliveryInterest: Bool,
        priority: UInt8
    ) async throws -> UInt32 {
        let stateVersion = try await bulk.allocateCorrelationID()
        guard
            let payload = TerminalMultiplexFlowRecordCodec.encode(
                TerminalMultiplexVisibilityRecord(
                    isVisible: isVisible,
                    hasDeliveryInterest: hasDeliveryInterest,
                    priority: priority,
                    stateVersion: stateVersion
                )
            )
        else {
            throw TerminalMultiplexSessionError.invalidFrame
        }
        try await send(
            opcode: .visibilityGate,
            sequence: await delivery.currentParsedSequence(),
            correlationID: stateVersion,
            payload: payload
        )
        return stateVersion
    }

    private func send(
        opcode: TerminalMultiplexOpcodeWire,
        sequence: UInt64,
        correlationID: UInt32,
        payload: Data
    ) async throws {
        try await bulk.send(
            TerminalMultiplexFrame(
                opcode: opcode,
                routeID: routeID,
                epoch: 0,
                sequence: sequence,
                correlationID: correlationID,
                payload: payload
            )
        )
    }
}
