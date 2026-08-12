import SwiftUI

struct TerminalPrototypeView: View {
    @State private var model: TerminalPrototypeModel

    init(factory: any TerminalSurfaceFactory) {
        _model = State(initialValue: TerminalPrototypeModel(factory: factory))
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TerminalSurfaceHost(surface: model.surface)
                .background(Color(red: 0.035, green: 0.047, blue: 0.075))

            FloatingGlassSurface {
                HStack(spacing: Theme.Spacing.medium) {
                    VStack(alignment: .trailing, spacing: Theme.Spacing.extraSmall) {
                        Text(model.lastEvent)
                            .font(.caption)
                            .lineLimit(1)
                        Text(statusDetail)
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }

                    Button("Keyboard", systemImage: "keyboard", action: model.focus)
                        .buttonStyle(.glassProminent)
                }
            }
            .padding(Theme.Spacing.standard)
        }
        .navigationTitle(Text("Terminal Prototype"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: model.loadFixture)
    }

    private var statusDetail: String {
        let grid = model.gridSize.map { "\($0.columns) × \($0.rows)" } ?? "— × —"
        return String(localized: "\(grid) · \(model.inputByteCount) input bytes")
    }
}
