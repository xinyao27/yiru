import AVFoundation
import Photos

enum YiruMediaPermission {
    static func requestCamera() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            true
        case .notDetermined:
            await withCheckedContinuation { continuation in
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    continuation.resume(returning: granted)
                }
            }
        case .denied, .restricted:
            false
        @unknown default:
            false
        }
    }

    static func requestPhotoLibrary() async -> Bool {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized, .limited:
            true
        case .notDetermined:
            await withCheckedContinuation { continuation in
                PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                    continuation.resume(returning: status == .authorized || status == .limited)
                }
            }
        case .denied, .restricted:
            false
        @unknown default:
            false
        }
    }
}
