import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct NativeChatAttachmentPicker: View {
    let isDisabled: Bool
    let isPending: Bool
    let picked: (Data) -> Void
    let failed: (String) -> Void

    @State private var isCameraPresented = false
    @State private var isFilesPresented = false
    @State private var isPhotosPresented = false
    @State private var photoItem: PhotosPickerItem?

    var body: some View {
        Menu {
            Button("Camera", iconID: .camera, action: presentCamera)
            Button("Photos", iconID: .image) {
                presentPhotos()
            }
            Button("Files", iconID: .folder) {
                isFilesPresented = true
            }
        } label: {
            Group {
                if isPending {
                    YiruLoader(
                        size: 18
                    )
                } else {
                    YiruIcon(.add, size: Theme.Control.regularIcon)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
            }
            .frame(
                width: Theme.Control.regularHeight,
                height: Theme.Control.regularHeight
            )
            // Why: Menu labels do not receive the same native material resolution as a Button
            // label. This trigger is meant to read as the near-opaque card surface, so it sets
            // that surface directly instead of letting a Menu-specific material turn it grey.
            .background(Theme.Colors.content, in: .circle)
            .overlay {
                Circle().stroke(Theme.Colors.divider, lineWidth: Theme.Size.hairline)
            }
            .frame(width: Theme.Size.minimumHitTarget, height: Theme.Size.minimumHitTarget)
            .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .disabled(isDisabled || isPending)
        .opacity(isDisabled ? 0.4 : 1)
        .accessibilityLabel(isPending ? "Adding attachment" : "Add attachment")
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
                    picked($0)
                },
                cancelled: { isCameraPresented = false }
            )
            .ignoresSafeArea()
        }
    }

    private func presentCamera() {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            failed(String(localized: "Camera unavailable"))
            return
        }
        Task { @MainActor in
            guard await YiruMediaPermission.requestCamera() else {
                failed(String(localized: "Camera permission denied"))
                return
            }
            isCameraPresented = true
        }
    }

    private func presentPhotos() {
        Task { @MainActor in
            guard await YiruMediaPermission.requestPhotoLibrary() else {
                failed(String(localized: "Photo permission denied"))
                return
            }
            isPhotosPresented = true
        }
    }

    private func loadPhoto(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            defer { photoItem = nil }
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else {
                    failed(String(localized: "Photo could not be read"))
                    return
                }
                picked(data)
            } catch {
                failed(String(localized: "Photo could not be read"))
            }
        }
    }

    private func loadFile(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else {
            if case .failure = result { failed(String(localized: "Image could not be read")) }
            return
        }
        Task {
            let didStart = url.startAccessingSecurityScopedResource()
            defer { if didStart { url.stopAccessingSecurityScopedResource() } }
            do {
                picked(try Data(contentsOf: url, options: .mappedIfSafe))
            } catch {
                failed(String(localized: "Image could not be read"))
            }
        }
    }
}

struct NativeChatCameraPicker: UIViewControllerRepresentable {
    let picked: (Data) -> Void
    let cancelled: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(picked: picked, cancelled: cancelled)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let controller = UIImagePickerController()
        controller.sourceType = .camera
        controller.mediaTypes = [UTType.image.identifier]
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate,
        UINavigationControllerDelegate
    {
        let picked: (Data) -> Void
        let cancelled: () -> Void

        init(picked: @escaping (Data) -> Void, cancelled: @escaping () -> Void) {
            self.picked = picked
            self.cancelled = cancelled
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            guard let image = info[.originalImage] as? UIImage,
                let data = image.jpegData(compressionQuality: 1) ?? image.pngData()
            else {
                cancelled()
                return
            }
            picked(data)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            cancelled()
        }
    }
}
