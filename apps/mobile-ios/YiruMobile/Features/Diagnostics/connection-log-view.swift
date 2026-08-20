import SwiftUI

struct ConnectionLogView: View {
    @State private var model: ConnectionLogModel

    init(hosts: any HostRepository, diagnostics: any ConnectionDiagnosticsRepository) {
        _model = State(initialValue: ConnectionLogModel(hosts: hosts, diagnostics: diagnostics))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if model.hosts.count > 1 { hostPicker }
            if let host = model.selectedHost {
                HStack(spacing: 8) {
                    Text(statusLine)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                    Spacer(minLength: 0)
                    Button(action: model.copyDiagnostics) {
                        Label {
                            Text(model.isCopied ? "Copied" : "Copy diagnostics")
                                .foregroundStyle(Theme.Colors.foreground)
                        } icon: {
                            YiruIcon(model.isCopied ? .check : .copy, size: 16)
                                .foregroundStyle(
                                    model.isCopied
                                        ? Theme.Colors.success : Theme.Colors.mutedForeground
                                )
                        }
                        .font(.system(size: 12, weight: .medium))
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.inline)
                }
                if model.snapshot.entries.isEmpty {
                    Text(
                        "No connection events yet this session. Events appear as the app dials this host."
                    )
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .lineSpacing(4)
                } else {
                    logCard(host: host)
                }
            } else {
                Text("No paired hosts.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(Theme.Colors.background)
        .navigationTitle(Text("Connection log"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .task(id: model.selectedHostID) { await model.observe() }
    }

    private var hostPicker: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(model.hosts, id: \.id) { host in
                    Button(host.name) { model.selectedHostID = host.id }
                        .font(.system(size: 12))
                        .buttonStyle(.glass)
                        .buttonBorderShape(.capsule)
                        .tint(
                            model.selectedHostID == host.id
                                ? Theme.Colors.selection : Theme.Colors.mutedForeground
                        )
                        .appButtonContext(.inline)
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    // Why: mirrors the old Mobile `ConnectionLog` card — a bounded, auto-scrolling
    // log surface near the top of the page, not an unbounded page-filling list.
    // See apps/mobile/src/components/connection-log.tsx.
    private func logCard(host: HostProfile) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(host.name.uppercased())
                    .font(.system(size: 11, design: .monospaced))
                    .tracking(0.6)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(model.snapshot.entries) { entry in
                                logRow(entry).id(entry.id)
                            }
                        }
                    }
                    .frame(maxHeight: 200)
                    .onChange(of: model.snapshot.entries.count) { _, _ in
                        guard let lastID = model.snapshot.entries.last?.id else { return }
                        withAnimation(.smooth) { proxy.scrollTo(lastID, anchor: .bottom) }
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .frame(maxHeight: 240)
        .background(Theme.Colors.content)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Theme.Colors.divider, lineWidth: 1.0 / 3.0)
        }
    }

    private func logRow(_ entry: ConnectionLogEntry) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(elapsedLabel(for: entry))
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(width: 56, alignment: .leading)
            Text(logGlyph(entry.level))
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(logColor(entry.level))
                .frame(width: 12, alignment: .center)
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.message)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(logColor(entry.level))
                if let detail = entry.detail {
                    Text(detail)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(2)
                        .textSelection(.enabled)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // Why: elapsed time since the first entry is actionable for "why is
    // connecting stuck"; absolute wall-clock time is not. Matches
    // apps/mobile/src/components/connection-log.tsx formatTime.
    private func elapsedLabel(for entry: ConnectionLogEntry) -> String {
        let base = model.snapshot.entries.first?.date ?? entry.date
        let elapsed = max(0, entry.date.timeIntervalSince(base))
        if elapsed < 10 { return String(format: "+%.2fs", elapsed) }
        if elapsed < 100 { return String(format: "+%.1fs", elapsed) }
        return "+\(Int(elapsed.rounded()))s"
    }

    private var statusLine: String {
        let attempt = model.snapshot.reconnectAttempt
        let base = connectionPhaseLabel(model.snapshot.phase)
        return attempt > 0 ? "\(base) · attempt \(attempt)" : base
    }

    private func logGlyph(_ level: ConnectionLogLevel) -> String {
        switch level {
        case .info: "•"
        case .success: "✓"
        case .warning: "!"
        case .error: "✕"
        }
    }

    private func logColor(_ level: ConnectionLogLevel) -> Color {
        switch level {
        case .info: Theme.Colors.mutedForeground
        case .success: Theme.Colors.success
        case .warning: Theme.Colors.unread
        case .error: Theme.Colors.attention
        }
    }
}
