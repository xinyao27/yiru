// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "YiruComputerUseMacOS",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "YiruComputerUseMacOSCore",
            targets: ["YiruComputerUseMacOSCore"]
        ),
        .executable(
            name: "yiru-computer-use-macos",
            targets: ["YiruComputerUseMacOS"]
        )
    ],
    targets: [
        .target(
            name: "YiruComputerUseMacOSCore",
            path: "Sources/YiruComputerUseMacOSCore"
        ),
        .target(
            name: "AskForPermission",
            path: "vendor/ask-for-permission/Sources/AskForPermission",
            swiftSettings: [
                // Why: the vendored package is authored for the Swift 5.9 language mode.
                .swiftLanguageMode(.v5)
            ]
        ),
        .executableTarget(
            name: "YiruComputerUseMacOS",
            dependencies: [
                "YiruComputerUseMacOSCore",
                "AskForPermission"
            ],
            path: "Sources/YiruComputerUseMacOS"
        )
    ]
)
