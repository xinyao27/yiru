#if DEBUG
    import SwiftUI

    struct WorkspaceBrowserFixtureView: View {
        var body: some View {
            NavigationStack {
                WorkspaceBrowserPane(
                    hostID: "fixture-host",
                    worktreeID: "fixture-worktree",
                    descriptor: WorkspaceBrowserTab(
                        workspaceID: "fixture-workspace",
                        pageID: "fixture-page",
                        url: "https://yiru.app/docs",
                        isLoading: false,
                        canGoBack: true,
                        canGoForward: false
                    ),
                    isVisible: true,
                    repository: WorkspaceBrowserFixtureRepository()
                )
                .navigationTitle("Browser")
                .navigationBarTitleDisplayMode(.inline)
            }
        }
    }

    nonisolated struct WorkspaceBrowserFixtureRepository: WorkspaceBrowserRepository {
        func browserEvents(
            for _: String,
            worktreeID _: String,
            pageID _: String,
            configuration: WorkspaceBrowserStreamConfiguration
        ) async throws -> AsyncThrowingStream<WorkspaceBrowserEvent, Error> {
            AsyncThrowingStream { continuation in
                continuation.yield(.ready(url: "https://yiru.app/docs", title: "Yiru Docs"))
                continuation.yield(.frame(fixtureFrame(configuration: configuration)))
            }
        }

        func navigateBrowser(
            for _: String,
            worktreeID _: String,
            pageID _: String,
            action _: WorkspaceBrowserNavigation
        ) async throws -> String { "https://yiru.app/docs" }

        func navigateBrowser(
            for _: String,
            worktreeID _: String,
            pageID _: String,
            url: String
        ) async throws -> String { url }

        func clickBrowser(
            for _: String,
            worktreeID _: String,
            pageID _: String,
            point _: WorkspaceBrowserPoint,
            button _: WorkspaceBrowserButton,
            radius _: Double?,
            modifiers _: [WorkspaceBrowserPointerModifier]
        ) async throws {}

        func scrollBrowser(
            for _: String,
            worktreeID _: String,
            pageID _: String,
            point _: WorkspaceBrowserPoint,
            deltaX _: Double,
            deltaY _: Double
        ) async throws {}

        func pressBrowserKey(
            for _: String,
            worktreeID _: String,
            pageID _: String,
            key _: String
        ) async throws {}

        func insertBrowserText(
            for _: String,
            worktreeID _: String,
            pageID _: String,
            text _: String
        ) async throws {}

        func respondToBrowserDialog(
            for _: String,
            worktreeID _: String,
            pageID _: String,
            accepts _: Bool
        ) async throws {}

        private func fixtureFrame(
            configuration: WorkspaceBrowserStreamConfiguration
        ) -> WorkspaceBrowserFrame {
            let size = CGSize(width: configuration.width, height: configuration.height)
            let renderer = UIGraphicsImageRenderer(size: size)
            let image = renderer.image { context in
                UIColor(red: 24 / 255, green: 24 / 255, blue: 24 / 255, alpha: 1).setFill()
                context.fill(CGRect(origin: .zero, size: size))
                UIColor(red: 240 / 255, green: 240 / 255, blue: 240 / 255, alpha: 1).setFill()
                let title = "Yiru Documentation"
                title.draw(
                    at: CGPoint(x: 28, y: 150),
                    withAttributes: [
                        .font: UIFont.systemFont(ofSize: 28, weight: .semibold),
                        .foregroundColor: UIColor.white,
                    ]
                )
                "Remote Chromium frame · iOS 26 client".draw(
                    at: CGPoint(x: 28, y: 198),
                    withAttributes: [
                        .font: UIFont.systemFont(ofSize: 15),
                        .foregroundColor: UIColor.lightGray,
                    ]
                )
            }
            return WorkspaceBrowserFrame(
                sequence: 1,
                format: "jpeg",
                metadata: WorkspaceBrowserFrameMetadata(
                    offsetTop: 0,
                    pageScaleFactor: 1,
                    deviceWidth: size.width,
                    deviceHeight: size.height,
                    imageWidth: size.width,
                    imageHeight: size.height,
                    scrollOffsetX: 0,
                    scrollOffsetY: 0,
                    timestamp: Date().timeIntervalSince1970
                ),
                image: image.jpegData(compressionQuality: 0.82) ?? Data()
            )
        }
    }
#endif
