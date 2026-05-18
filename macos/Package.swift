// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "CodemMac",
    platforms: [
        .macOS(.v12)
    ],
    products: [
        .executable(name: "CodemMac", targets: ["CodemMac"])
    ],
    targets: [
        .executableTarget(
            name: "CodemMac",
            path: "Sources/CodemMac"
        )
    ]
)
