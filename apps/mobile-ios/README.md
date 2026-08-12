# Yiru for iOS

Yiru 的原生 iOS 26 客户端。它与 `apps/mobile` 并行开发，迁移完成前不替换 Expo
客户端，也不承担 Android 或 Web 兼容。

技术基线：

- iOS / iPadOS 26 起
- Xcode 26.6 稳定版
- Swift 6 language mode，Swift 6.3 编译器，完整 strict concurrency
- SwiftUI、Observation、NavigationStack 与系统 Liquid Glass
- URLSession WebSocket、CryptoKit 与固定版本 Swift-sodium 组成的 E2EE v2 transport
- XcodeGen 生成工程，`.xcodeproj` 不入库

常用命令：

```sh
vp run yiru-mobile-ios#project:generate
vp run yiru-mobile-ios#dev
vp run yiru-mobile-ios#verify
vp run yiru-mobile-ios#wire:verify
```

代码结构和依赖规则见 [ARCHITECTURE.md](./ARCHITECTURE.md)，视觉规则见
[DESIGN.md](./DESIGN.md)，功能迁移顺序见 [MIGRATION.md](./MIGRATION.md)。Terminal renderer
的候选、证据与 prototype 闸门见
[terminal-technology-research.md](./docs/terminal-technology-research.md)。
