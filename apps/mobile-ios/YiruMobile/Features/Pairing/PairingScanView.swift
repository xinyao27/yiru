import AVFoundation
import SwiftUI
import UIKit
import VisionKit

struct PairingScanView: View {
    let onOffer: (PairingOffer) -> Void

    @State private var cameraAccess = CameraAccess.checking
    @State private var isPastePresented = false
    @State private var pastedCode = ""
    @State private var errorMessage: LocalizedStringResource?

    private let decoder = PairingCodeDecoder()

    var body: some View {
        ZStack {
            AtmosphereBackground()
            cameraContent
        }
        .navigationTitle(Text("Pair with desktop"))
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            controls
        }
        .sheet(isPresented: $isPastePresented) {
            pasteSheet
        }
        .task {
            cameraAccess = await resolveCameraAccess()
        }
        .alert("Pairing code not recognized", isPresented: hasError) {
            Button("Try again", role: .cancel) {}
        } message: {
            if let errorMessage {
                Text(errorMessage)
            }
        }
    }

    @ViewBuilder
    private var cameraContent: some View {
        switch cameraAccess {
        case .checking:
            ProgressView("Checking camera access…")
        case .available:
            PairingScannerView(onCode: handleScannedCode)
                .ignoresSafeArea(edges: .bottom)
                .overlay {
                    RoundedRectangle(cornerRadius: Theme.Radius.floatingSurface)
                        .stroke(.white.opacity(0.9), lineWidth: 3)
                        .frame(width: 260, height: 260)
                        .shadow(color: .black.opacity(0.18), radius: 12)
                        .accessibilityHidden(true)
                }
        case .denied:
            unavailableContent(
                title: "Camera access is disabled",
                detail: "Enable camera access in Settings, or paste the pairing code instead.",
                actionTitle: "Open Settings",
                action: openSettings
            )
        case .unsupported:
            unavailableContent(
                title: "QR scanning is unavailable",
                detail: "Paste the pairing code copied from Yiru on your desktop.",
                actionTitle: "Paste pairing code",
                action: { isPastePresented = true }
            )
        }
    }

    private var controls: some View {
        FloatingGlassSurface {
            VStack(spacing: Theme.Spacing.medium) {
                Text("Scan the QR code shown by Yiru on your desktop.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button("Paste code instead", systemImage: "doc.on.clipboard") {
                    isPastePresented = true
                }
                .buttonStyle(.glassProminent)
            }
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.bottom, Theme.Spacing.small)
    }

    private var pasteSheet: some View {
        NavigationStack {
            Form {
                Section("Pairing code") {
                    TextEditor(text: $pastedCode)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.system(.body, design: .monospaced))
                        .frame(minHeight: 140)
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
        .presentationDetents([.medium, .large])
    }

    private var hasError: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { isPresented in
                if !isPresented { errorMessage = nil }
            }
        )
    }

    private func unavailableContent(
        title: LocalizedStringKey,
        detail: LocalizedStringKey,
        actionTitle: LocalizedStringKey,
        action: @escaping () -> Void
    ) -> some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                Label(title, systemImage: "camera.fill")
                    .font(.headline)
                Text(detail)
                    .foregroundStyle(.secondary)
                Button(action: action) {
                    Text(actionTitle)
                }
                .buttonStyle(.glassProminent)
            }
        }
        .padding(Theme.Spacing.page)
    }

    private func handleScannedCode(_ code: String) {
        do {
            onOffer(try decoder.decodeScannedURL(code))
        } catch {
            errorMessage = "This is not a valid Yiru pairing QR code."
        }
    }

    private func handlePastedCode() {
        do {
            let offer = try decoder.decode(pastedCode)
            isPastePresented = false
            onOffer(offer)
        } catch {
            errorMessage = "Copy a fresh pairing code from your desktop and paste it again."
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
            return await AVCaptureDevice.requestAccess(for: .video) ? .available : .denied
        case .denied, .restricted:
            return .denied
        @unknown default:
            return .unsupported
        }
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}

private enum CameraAccess {
    case checking
    case available
    case denied
    case unsupported
}
