import Foundation
import SwiftUI

struct PairingLog: View {
    let entries: [PairingLogEntry]

    var body: some View {
        if let baseDate = entries.first?.date {
            ContentSurface {
                VStack(alignment: .leading, spacing: 8) {
                    Text("PAIRING LOG")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .tracking(0.6)
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 8) {
                                ForEach(entries) { entry in
                                    entryRow(entry, baseDate: baseDate)
                                        .id(entry.id)
                                }
                            }
                        }
                        .scrollIndicators(.hidden)
                        .frame(maxHeight: 200)
                        .onChange(of: entries.count) {
                            guard let lastID = entries.last?.id else { return }
                            withAnimation(.easeOut(duration: 0.18)) {
                                proxy.scrollTo(lastID, anchor: .bottom)
                            }
                        }
                    }
                }
            }
        }
    }

    private func entryRow(_ entry: PairingLogEntry, baseDate: Date) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(elapsedLabel(entry.date, since: baseDate))
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(width: 56, alignment: .leading)
            Text(glyph(entry.level))
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(color(entry.level))
                .frame(width: 12)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: entry.message)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(color(entry.level))
                if let detail = entry.detail {
                    Text(verbatim: detail)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func elapsedLabel(_ date: Date, since baseDate: Date) -> String {
        let elapsed = max(0, date.timeIntervalSince(baseDate))
        if elapsed < 10 { return String(format: "+%.2fs", elapsed) }
        if elapsed < 100 { return String(format: "+%.1fs", elapsed) }
        return "+\(Int(elapsed.rounded()))s"
    }

    private func glyph(_ level: PairingLogLevel) -> String {
        switch level {
        case .info: "•"
        case .success: "✓"
        case .warning: "!"
        case .error: "×"
        }
    }

    private func color(_ level: PairingLogLevel) -> Color {
        switch level {
        case .info: Theme.Colors.mutedForeground
        case .success: Theme.Colors.success
        case .warning: Theme.Colors.unread
        case .error: Theme.Colors.attention
        }
    }
}
