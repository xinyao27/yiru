import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct TerminalImageAttachment {
    let isPending: Bool
    let picked: (Data) -> Void
    let failed: (String) -> Void
}

struct TerminalToolsMenu: View {
    let state: TerminalAccessoryState
    let attachment: TerminalImageAttachment?
    @State private var isCameraPresented = false
    @State private var isFilesPresented = false
    @State private var isPhotosPresented = false
    @State private var photoItem: PhotosPickerItem?

    var body: some View {
        Menu {
            if let attachment {
                Menu {
                    Button("Camera", iconID: .camera, action: presentCamera)
                    Button("Photos", iconID: .image) {
                        presentPhotos()
                    }
                    Button("Files", iconID: .folder) {
                        isFilesPresented = true
                    }
                } label: {
                    YiruIconButtonLabel(title: "Add attachment", icon: .attachment)
                }
                .disabled(!state.isEnabled || attachment.isPending)
            }

            // Why: SwiftUI presents nested menu entries before sibling actions on iPad. The
            // source order is reversed here so the rendered order is paste first, then the
            // attachment submenu, on both idioms.
            Button("Paste from Clipboard", iconID: .clipboard) {
                paste()
            }
            // Why: refresh `canPaste` from the clipboard's actual contents and disable Paste
            // when it holds neither string nor image, so the action reads as unavailable
            // instead of failing silently when tapped.
            .disabled(!state.isEnabled || !clipboardHasPasteableContent)
        } label: {
            Group {
                if attachment?.isPending == true {
                    YiruLoader(size: TerminalChromeMetrics.accessoryIcon)
                } else {
                    YiruIcon(.add, size: TerminalChromeMetrics.accessoryIcon)
                }
            }
            .frame(
                width: TerminalChromeMetrics.accessoryVisualSize,
                height: TerminalChromeMetrics.accessoryVisualSize
            )
            .foregroundStyle(Theme.Colors.foreground)
            .glassEffect(.regular.interactive(), in: .circle)
        }
        .buttonStyle(.appPlain)
        .frame(
            width: TerminalChromeMetrics.accessoryHitSize,
            height: TerminalChromeMetrics.accessoryHitSize
        )
        .contentShape(.interaction, .rect)
        .disabled(!state.isEnabled)
        .accessibilityLabel(
            attachment?.isPending == true ? "Adding attachment" : "Open terminal tools"
        )
        .photosPicker(
            isPresented: $isPhotosPresented,
            selection: $photoItem,
            matching: .images
        )
        .onChange(of: photoItem) { _, item in loadPhoto(item) }
        .fileImporter(
            isPresented: $isFilesPresented,
            allowedContentTypes: [.image],
            allowsMultipleSelection: false,
            onCompletion: loadFile
        )
        .sheet(isPresented: $isCameraPresented) {
            NativeChatCameraPicker(
                picked: {
                    isCameraPresented = false
                    attachment?.picked($0)
                },
                cancelled: { isCameraPresented = false }
            )
            .ignoresSafeArea()
        }
    }

    private func presentCamera() {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            attachment?.failed(String(localized: "Camera unavailable"))
            return
        }
        Task { @MainActor in
            guard await YiruMediaPermission.requestCamera() else {
                attachment?.failed(String(localized: "Camera permission denied"))
                return
            }
            isCameraPresented = true
        }
    }

    private func presentPhotos() {
        Task { @MainActor in
            guard await YiruMediaPermission.requestPhotoLibrary() else {
                attachment?.failed(String(localized: "Photo permission denied"))
                return
            }
            isPhotosPresented = true
        }
    }

    private var clipboardHasPasteableContent: Bool {
        UIPasteboard.general.hasStrings || UIPasteboard.general.hasImages
    }

    private func paste() {
        guard let attachment, let image = UIPasteboard.general.image else {
            state.paste()
            return
        }
        guard let data = preparedClipboardData(image) else {
            attachment.failed(String(localized: "Image could not be read"))
            return
        }
        attachment.picked(data)
    }

    private func loadPhoto(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            defer { photoItem = nil }
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else {
                    attachment?.failed(String(localized: "Photo could not be read"))
                    return
                }
                attachment?.picked(data)
            } catch {
                attachment?.failed(String(localized: "Photo could not be read"))
            }
        }
    }

    private func loadFile(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else {
            if case .failure = result {
                attachment?.failed(String(localized: "Image could not be read"))
            }
            return
        }
        Task {
            let didStart = url.startAccessingSecurityScopedResource()
            defer { if didStart { url.stopAccessingSecurityScopedResource() } }
            do {
                attachment?.picked(try Data(contentsOf: url, options: .mappedIfSafe))
            } catch {
                attachment?.failed(String(localized: "Image could not be read"))
            }
        }
    }
}

private func preparedClipboardData(_ source: UIImage) -> Data? {
    let byteLimit = 18 * 1_024 * 1_024
    var image = source
    for _ in 0..<4 {
        guard let data = image.pngData() else { return nil }
        if data.count <= byteLimit { return data }
        let scale = sqrt(Double(byteLimit) / Double(data.count)) * 0.85
        let size = CGSize(
            width: max(1, floor(image.size.width * scale)),
            height: max(1, floor(image.size.height * scale))
        )
        image = UIGraphicsImageRenderer(size: size).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
    return nil
}
