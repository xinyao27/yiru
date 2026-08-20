import AVFoundation
import SwiftUI
import UIKit
import VisionKit

struct PairingScanView: View {
    private let runtime: any PairingRuntime
    private let onPaired: (HostProfile) -> Void

    @Environment(\.scenePhase) private var scenePhase
    @State private var cameraAccess = CameraAccess.checking
    @State private var isPastePresented = false
    @State private var pastedCode = ""
    @State private var scanErrorMessage: LocalizedStringResource?
    @State private var pairingModel: PairingModel?
    @State private var pairingTask: Task<Void, Never>?

    private let decoder = PairingCodeDecoder()

    init(
        runtime: any PairingRuntime,
        initialPastedCode: String = "",
        onPaired: @escaping (HostProfile) -> Void
    ) {
        self.runtime = runtime
        self.onPaired = onPaired
        _pastedCode = State(initialValue: initialPastedCode)
    }

    var body: some View {
        ZStack {
            AppBackground()
            content
        }
        .navigationTitle(Text("Pair with desktop"))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isPastePresented) {
            pasteSheet
        }
        .task(id: scenePhase) {
            guard scenePhase == .active, pairingModel == nil else { return }
            cameraAccess = await resolveCameraAccess()
        }
        .onDisappear {
            pairingTask?.cancel()
            pairingTask = nil
        }
    }

    @ViewBuilder
    private var content: some View {
        if let pairingModel {
            pairingContent(pairingModel)
        } else if let scanErrorMessage {
            errorContent(scanErrorMessage)
        } else {
            cameraContent
        }
    }

    @ViewBuilder
    private var cameraContent: some View {
        switch cameraAccess {
        case .checking:
            ProgressView("Checking camera access…")
        case .requestable:
            // Why: the navigation title above already reads "Pair with desktop"; repeating
            // it as the body heading duplicates the same text twice on one screen instead of
            // explaining what this step needs.
            unavailableContent(
                title: "Camera access needed",
                detail:
                    "Scan the QR code from Yiru on your desktop, or paste the pairing code instead.",
                actionTitle: "Continue",
                action: requestCameraAccess,
                secondaryActionTitle: "Paste code instead",
                secondaryAction: { isPastePresented = true }
            )
        case .available:
            availableCameraContent
        case .denied:
            unavailableContent(
                title: "Camera Access Disabled",
                detail: "Enable camera access in Settings, or paste the pairing code instead.",
                actionTitle: "Open Settings",
                action: openSettings,
                secondaryActionTitle: "Paste code instead",
                secondaryAction: { isPastePresented = true }
            )
        case .unsupported:
            unavailableContent(
                title: "QR scanning is unavailable",
                detail: "Paste the pairing code copied from Yiru on your desktop.",
                iconID: .qrCodeScan,
                actionTitle: "Paste pairing code",
                action: { isPastePresented = true }
            )
        }
    }

    private var availableCameraContent: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                pairingStep(number: 1, text: "Open Yiru on your computer")
                pairingStep(number: 2, text: "Go to Settings → Mobile")
                pairingStep(number: 3, text: "Scan the QR code")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.bottom, Theme.Spacing.medium)

            Group {
                if isPastePresented {
                    Theme.Colors.background
                } else {
                    PairingScannerView(onCode: handleScannedCode)
                        .overlay {
                            PairingScanReticle()
                        }
                }
            }
            .clipShape(.rect(cornerRadius: Theme.Radius.floatingSurface))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, Theme.Spacing.page)

            Button("Or paste pairing code") {
                isPastePresented = true
            }
            .buttonStyle(.glass)
            .appButtonContext(.regular)
            .padding(.top, Theme.Spacing.small)
            .padding(.bottom, Theme.Spacing.small)
        }
    }

    private var pasteSheet: some View {
        NavigationStack {
            Form {
                Section {
                    ZStack(alignment: .topLeading) {
                        if pastedCode.isEmpty {
                            Text("yiru://pair?code=... or paste the code")
                                .font(.system(.body, design: .monospaced))
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 8)
                                .allowsHitTesting(false)
                        }
                        TextEditor(text: $pastedCode)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(.system(.body, design: .monospaced))
                            .scrollContentBackground(.hidden)
                            .frame(minHeight: 140)
                    }
                } header: {
                    Text("Pairing code")
                } footer: {
                    Text("Copy the code shown under the QR on your computer.")
                }
            }
            .navigationTitle(Text("Paste pairing code"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isPastePresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Continue") { handlePastedCode() }
                        .disabled(
                            pastedCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        // Why: a single pairing-code field is a short form, matching the other
        // fixed-height form sheets rather than the resizable list sheets.
        .appSheetPresentation(.fixed(.medium))
    }

    @ViewBuilder
    private func pairingContent(_ model: PairingModel) -> some View {
        switch model.phase {
        case .ready, .connecting:
            VStack(spacing: Theme.Spacing.medium) {
                ProgressView()
                    .controlSize(.large)
                Text("Connecting…")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                PairingLog(entries: model.logEntries)
                    .frame(maxWidth: .infinity)
            }
            .frame(maxWidth: Theme.Size.readingWidth)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(Theme.Spacing.page)
        case .failed(let message):
            pairingFailureContent(message, entries: model.logEntries)
        }
    }

    private func pairingFailureContent(
        _ message: LocalizedStringResource,
        entries: [PairingLogEntry]
    ) -> some View {
        VStack(spacing: Theme.Spacing.medium) {
            Text(message)
                .font(.system(size: 14))
                .foregroundStyle(Theme.Colors.attention)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
            PairingLog(entries: entries)
                .frame(maxWidth: .infinity)
            retryActions
        }
        .frame(maxWidth: Theme.Size.readingWidth)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(Theme.Spacing.page)
    }

    private func errorContent(_ message: LocalizedStringResource) -> some View {
        VStack(spacing: Theme.Spacing.large) {
            Text(message)
                .font(.system(size: 14))
                .foregroundStyle(Theme.Colors.attention)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
            retryActions
        }
        .frame(maxWidth: Theme.Size.readingWidth)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(Theme.Spacing.page)
    }

    private var retryActions: some View {
        StackedGlassActionGroup {
            Button("Try Again", action: retry)
                .appProminentGlassButton()
                .appButtonContext(.large)
            Button("Paste code instead") {
                retry()
                isPastePresented = true
            }
            .buttonStyle(.glass)
            .appButtonContext(.large)
        }
    }

    private func unavailableContent(
        title: LocalizedStringKey,
        detail: LocalizedStringKey,
        iconID: YiruIconID = .camera,
        actionTitle: LocalizedStringKey,
        action: @escaping () -> Void,
        secondaryActionTitle: LocalizedStringKey? = nil,
        secondaryAction: (() -> Void)? = nil
    ) -> some View {
        AppUnavailableState(
            title: Text(title),
            iconID: iconID,
            description: Text(detail)
        ) {
            StackedGlassActionGroup {
                Button(action: action) {
                    Text(actionTitle)
                }
                .appProminentGlassButton()
                .appButtonContext(.large)

                if let secondaryActionTitle, let secondaryAction {
                    Button(action: secondaryAction) {
                        Text(secondaryActionTitle)
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.large)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func handleScannedCode(_ code: String) {
        do {
            beginPairing(try decoder.decodeScannedURL(code))
        } catch {
            scanErrorMessage = "Not a valid Yiru QR code"
        }
    }

    private func handlePastedCode() {
        do {
            let offer = try decoder.decode(pastedCode)
            isPastePresented = false
            beginPairing(offer)
        } catch {
            isPastePresented = false
            scanErrorMessage =
                "Not a valid pairing code — copy it from your computer and paste again"
        }
    }

    private func beginPairing(_ offer: PairingOffer) {
        pairingTask?.cancel()
        scanErrorMessage = nil
        let model = PairingModel(offer: offer, runtime: runtime)
        pairingModel = model
        pairingTask = Task {
            if let host = await model.pair() {
                onPaired(host)
            }
        }
    }

    private func retry() {
        pairingTask?.cancel()
        pairingTask = nil
        pairingModel = nil
        scanErrorMessage = nil
    }

    private func pairingStep(number: Int, text: LocalizedStringKey) -> some View {
        HStack(spacing: Theme.Spacing.small) {
            Text(verbatim: String(number))
                .font(.system(size: 14))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(width: 24)
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
    }

    private func resolveCameraAccess() async -> CameraAccess {
        guard DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
            return .unsupported
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            return .available
        case .notDetermined:
            return .requestable
        case .denied, .restricted:
            return .denied
        @unknown default:
            return .unsupported
        }
    }

    private func requestCameraAccess() {
        Task {
            cameraAccess = await AVCaptureDevice.requestAccess(for: .video) ? .available : .denied
        }
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}

private enum CameraAccess: Equatable {
    case checking
    case requestable
    case available
    case denied
    case unsupported
}

private struct PairingScanReticle: View {
    private let size: CGFloat = 260
    private let corner: CGFloat = 28
    private let lineWidth: CGFloat = 2

    var body: some View {
        ZStack {
            reticleCorner(rotation: .degrees(0))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            reticleCorner(rotation: .degrees(90))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            reticleCorner(rotation: .degrees(270))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            reticleCorner(rotation: .degrees(180))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private func reticleCorner(rotation: Angle) -> some View {
        Path { path in
            path.move(to: CGPoint(x: 0, y: corner))
            path.addLine(to: .zero)
            path.addLine(to: CGPoint(x: corner, y: 0))
        }
        .stroke(.white.opacity(0.9), style: StrokeStyle(lineWidth: lineWidth, lineCap: .square))
        .frame(width: corner, height: corner)
        .rotationEffect(rotation)
    }
}
