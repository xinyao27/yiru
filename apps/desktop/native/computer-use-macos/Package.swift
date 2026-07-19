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
        .executableTarget(
            name: "YiruComputerUseMacOS",
            dependencies: ["YiruComputerUseMacOSCore"],
            path: "Sources/YiruComputerUseMacOS"
        )
    ]
)
