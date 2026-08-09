import AppKit
import AskForPermission
import SwiftUI

@MainActor
final class ComputerUsePermissionRuntime: NSObject, NSApplicationDelegate {
    private let initialPermission: ComputerUsePermission?
    private var windowController: ComputerUsePermissionWindowController?

    init(initialPermission: ComputerUsePermission?) {
        self.initialPermission = initialPermission
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let appName = Bundle.main.localizedInfoDictionary?["CFBundleDisplayName"] as? String
            ?? Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
            ?? translate("computer-use.app-name", fallback: "Yiru Computer Use")
        AskForPermission.configure(
            appName: appName,
            permissionKinds: [.accessibility, .screenRecording]
        )
        let controller = ComputerUsePermissionWindowController(
            initialPermission: initialPermission
        )
        windowController = controller
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

@MainActor
final class ComputerUsePermissionWindowController: NSWindowController {
    init(initialPermission: ComputerUsePermission?) {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 500, height: 380),
            styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        let permissionView = ComputerUsePermissionsView(initialPermission: initialPermission)
        super.init(window: window)

        window.title = translate(
            "computer-use.window.enable-title",
            fallback: "Enable Yiru Computer Use"
        )
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.isMovableByWindowBackground = true
        window.isReleasedWhenClosed = false
        window.isOpaque = false
        window.backgroundColor = .clear
        window.center()
        AskForPermission.prepareHostWindow(window)
        let hostingView = NSHostingView(rootView: permissionView)
        hostingView.autoresizingMask = [.width, .height]
#if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            let glassView = NSGlassEffectView()
            glassView.style = .regular
            glassView.cornerRadius = 14
            glassView.contentView = hostingView
            window.contentView = glassView
        } else {
            Self.installFallbackMaterial(hostingView: hostingView, in: window)
        }
#else
        Self.installFallbackMaterial(hostingView: hostingView, in: window)
#endif
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError()
    }

    private static func installFallbackMaterial(hostingView: NSView, in window: NSWindow) {
        let materialView = NSVisualEffectView()
        materialView.material = .underWindowBackground
        materialView.blendingMode = .behindWindow
        materialView.state = .active
        hostingView.frame = materialView.bounds
        materialView.addSubview(hostingView)
        window.contentView = materialView
    }
}

@MainActor
struct ComputerUsePermissionsView: View {
    let initialPermission: ComputerUsePermission?

    @StateObject private var permissions = PermissionsObserver()
    @State private var activePermission: ComputerUsePermission?

    var body: some View {
        VStack(spacing: 22) {
            header
            permissionRows
        }
        .padding(.horizontal, 28)
        .padding(.top, 28)
        .padding(.bottom, 26)
        .frame(width: 500, height: 380)
    }

    private var allPermissionsGranted: Bool {
        ComputerUsePermission.allCases.allSatisfy { permission in
            permissions.status(for: permission.kind)
        }
    }

    @ViewBuilder
    private var permissionRows: some View {
#if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            GlassEffectContainer(spacing: 10) {
                permissionRowList
            }
        } else {
            permissionRowList
        }
#else
        permissionRowList
#endif
    }

    private var permissionRowList: some View {
        VStack(spacing: 10) {
            ForEach(ComputerUsePermission.allCases) { permission in
                ComputerUsePermissionRow(
                    permission: permission,
                    isGranted: permissions.status(for: permission.kind),
                    activePermission: $activePermission,
                    shouldRequestOnAppear: initialPermission == permission,
                    onResult: { _ in
                        if initialPermission != nil {
                            NSApp.terminate(nil)
                        }
                    }
                )
            }
        }
    }

    private var header: some View {
        VStack(spacing: 5) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .scaledToFit()
                .frame(width: 52, height: 52)
                .shadow(color: Color.black.opacity(0.12), radius: 8, y: 3)
                .padding(.bottom, 3)
            Text(
                allPermissionsGranted
                    ? translate(
                        "computer-use.window.ready-title",
                        fallback: "Computer Use is Ready"
                    )
                    : translate(
                        "computer-use.window.enable-title",
                        fallback: "Enable Yiru Computer Use"
                    )
            )
                .font(.system(size: 18, weight: .semibold))
            Text(
                allPermissionsGranted
                    ? translate(
                        "computer-use.window.ready-description",
                        fallback: "Yiru can use local apps when you ask."
                    )
                    : translate(
                        "computer-use.window.enable-description",
                        fallback: """
                        Yiru Computer Use needs these permissions to use apps on your Mac.
                        These permissions are only used when you ask Yiru to perform tasks.
                        """
                    )
            )
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .lineSpacing(2)
            .frame(maxWidth: 390)
        }
    }
}

@MainActor
private struct ComputerUsePermissionRow: View {
    let permission: ComputerUsePermission
    let isGranted: Bool
    @Binding var activePermission: ComputerUsePermission?
    let shouldRequestOnAppear: Bool
    let onResult: (PermissionRequestResult) -> Void

    @State private var didRequestOnAppear = false

    var body: some View {
        rowSurface
            .askForPermission(item: permissionRequest) { result in
                activePermission = nil
                onResult(result)
            }
            .task {
                guard shouldRequestOnAppear, !didRequestOnAppear, !isGranted else {
                    if shouldRequestOnAppear && isGranted {
                        NSApp.terminate(nil)
                    }
                    return
                }
                didRequestOnAppear = true
                try? await Task.sleep(for: .milliseconds(150))
                requestPermission()
            }
    }

    @ViewBuilder
    private var rowSurface: some View {
#if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            rowContent
                .glassEffect(.regular, in: .rect(cornerRadius: 14))
        } else {
            fallbackRowSurface
        }
#else
        fallbackRowSurface
#endif
    }

    private var fallbackRowSurface: some View {
        rowContent
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(
                        Color(nsColor: .separatorColor).opacity(0.45),
                        lineWidth: 1
                    )
            )
            .shadow(color: Color.black.opacity(0.08), radius: 7, y: 2)
    }

    private var rowContent: some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(permission.iconBackground)
                    .frame(width: 38, height: 38)
                Image(systemName: permission.systemImage)
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(permission.iconForeground)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(permission.title)
                    .font(.system(size: 14, weight: .semibold))
                Text(permission.detail)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            if isGranted {
                Label(
                    translate("permission.status.done", fallback: "Done"),
                    systemImage: "checkmark.circle.fill"
                )
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            } else {
                requestControl
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 66)
    }

    @ViewBuilder
    private var requestControl: some View {
        Button(translate("permission.action.allow", fallback: "Allow")) {
            requestPermission()
        }
        .controlSize(.small)
        .disabled(isDisabled)
        .accessibilityLabel(requestAccessibilityLabel)
    }

    private var isDisabled: Bool {
        activePermission != nil && activePermission != permission
    }

    private var permissionRequest: Binding<PermissionKind?> {
        Binding(
            get: {
                activePermission == permission ? permission.kind : nil
            },
            set: { requestedPermission in
                activePermission = requestedPermission == nil ? nil : permission
            }
        )
    }

    private var requestAccessibilityLabel: String {
        String(
            format: translate(
                "permission.action.allow-accessibility-label",
                fallback: "Allow %@ in System Settings"
            ),
            permission.title
        )
    }

    private func requestPermission() {
        guard activePermission == nil, !isGranted else { return }
        activePermission = permission
    }
}

enum ComputerUsePermission: String, CaseIterable, Identifiable {
    case accessibility
    case screenshots

    var id: String { rawValue }

    static func parse(_ value: String?) -> ComputerUsePermission? {
        switch value {
        case "accessibility":
            return .accessibility
        case "screenshots", "screen", "screen-recording":
            return .screenshots
        default:
            return nil
        }
    }

    var kind: PermissionKind {
        switch self {
        case .accessibility:
            return .accessibility
        case .screenshots:
            return .screenRecording
        }
    }

    var title: String {
        switch self {
        case .accessibility:
            return translate("permission.accessibility.title", fallback: "Accessibility")
        case .screenshots:
            return translate("computer-use.screenshots.title", fallback: "Screenshots")
        }
    }

    var detail: String {
        switch self {
        case .accessibility:
            return translate(
                "computer-use.accessibility.description",
                fallback: "Read app interface trees and perform requested actions."
            )
        case .screenshots:
            return translate(
                "computer-use.screenshots.description",
                fallback: "Capture app windows so agents can inspect visual state."
            )
        }
    }

    var systemImage: String {
        switch self {
        case .accessibility:
            return "figure.arms.open"
        case .screenshots:
            return "camera.viewfinder"
        }
    }

    var iconBackground: Color {
        Color(nsColor: .quaternaryLabelColor).opacity(0.55)
    }

    var iconForeground: Color {
        Color(nsColor: .secondaryLabelColor)
    }
}

@MainActor
func runAskForPermissionSetup(initialPermissionValue: String? = nil) {
    let app = NSApplication.shared
    let delegate = ComputerUsePermissionRuntime(
        initialPermission: ComputerUsePermission.parse(initialPermissionValue)
    )
    app.delegate = delegate
    // Why: setup must foreground reliably; the long-running agent path stays accessory-only.
    app.setActivationPolicy(.regular)
    app.run()
}
