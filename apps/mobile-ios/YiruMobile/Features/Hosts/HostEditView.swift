import SwiftUI

struct HostEditView: View {
    @State private var model: HostEditModel
    @State private var saveTask: Task<Void, Never>?
    @FocusState private var focusedField: Field?
    private let onSaved: (HostProfile) -> Void

    init(
        host: HostProfile,
        repository: any HostRepository,
        connectionRuntime: any HostConnectionRuntime,
        onSaved: @escaping (HostProfile) -> Void
    ) {
        _model = State(
            initialValue: HostEditModel(
                host: host,
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
        _saveTask = State(initialValue: nil)
        self.onSaved = onSaved
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(
                    "Change the display name or connection address. Address edits only switch where this phone connects — they do not re-pair. Use this when the same desktop is reachable at a different IP (for example home LAN vs Tailscale)."
                )
                .font(.system(size: 14))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineSpacing(3)
                .padding(.bottom, 8)

                fieldLabel("Name")
                TextField("Host name", text: $model.name)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focusedField, equals: .name)
                    .onSubmit { focusedField = .address }
                    .onChange(of: model.name) { model.clearFailure() }
                    .modifier(HostFieldStyle())

                fieldLabel("Address")
                    .padding(.top, 8)
                TextField("192.168.1.10:6768", text: $model.address)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .submitLabel(.done)
                    .focused($focusedField, equals: .address)
                    .onSubmit { saveIfPossible() }
                    .onChange(of: model.address) { model.clearFailure() }
                    .modifier(HostFieldStyle())

                Text(
                    "Accepts IP, host:port, or ws:// / wss://. Missing port defaults to the current port (or 6768)."
                )
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineSpacing(2)

                endpointStatus
                    .padding(.top, 8)

                if let failure = model.failure {
                    Text(failure)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Colors.attention)
                        .padding(.top, 4)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.Colors.background.ignoresSafeArea())
        .navigationTitle("Edit Host")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    saveIfPossible()
                } label: {
                    if model.isSaving {
                        ProgressView()
                    } else {
                        Text("Save")
                    }
                }
                .disabled(!model.canSave)
                .accessibilityLabel("Save host")
            }
        }
        .onDisappear {
            saveTask?.cancel()
            saveTask = nil
        }
    }

    @ViewBuilder
    private var endpointStatus: some View {
        switch model.normalizedEndpoint {
        case .valid(let endpoint):
            Text("Connects to \(endpoint)")
                .font(.system(size: 12).monospaced())
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineLimit(2)
        case .invalid(let message):
            if !model.address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(message)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.Colors.attention)
            }
        }
    }

    private func fieldLabel(_ title: LocalizedStringKey) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .medium))
            .textCase(.uppercase)
            .tracking(0.5)
            .foregroundStyle(Theme.Colors.mutedForeground)
    }

    private func saveIfPossible() {
        guard model.canSave, saveTask == nil else { return }
        focusedField = nil
        saveTask = Task { @MainActor in
            defer { saveTask = nil }
            guard let updated = await model.save(), !Task.isCancelled else { return }
            onSaved(updated)
        }
    }

    private enum Field: Hashable {
        case name
        case address
    }
}

private struct HostFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 14))
            .foregroundStyle(Theme.Colors.foreground)
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .glassEffect(.regular.interactive(), in: .capsule)
    }
}
