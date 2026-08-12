# Architecture

目标不是把 React 组件逐个翻译成 SwiftUI，而是在保持协议和业务行为一致的前提下，
建立一个能长期维护的原生客户端。组织原则与 Atat 相同：从功能名可以一次猜中代码位置，
一个小功能变更通常只触碰同一 feature 的一到三个文件。

## 目录

```text
YiruMobile/
  App/                    composition root、全局路由、scene 生命周期
  DesignSystem/
    Foundations/          token、背景和环境值
    Surface/              Liquid Glass 表面规则
    Components/           三个以上无关 feature 复用的视觉语法
    Catalog/              Design System 的可运行目录
  Features/<Name>/
    Model/                纯领域值与规则，不依赖 SwiftUI
    Service/              此 feature 所需能力的窄 protocol
    State/                @Observable 状态与唯一 mutation owner
    UI/                   SwiftUI 页面和 feature 私有组件
  Platform/<Capability>/  URLSession、Keychain、通知、相机等 iOS adapter
  Resources/              asset catalog、string catalog、entitlement
```

不是每个 feature 都必须拥有四个子目录。文件少时直接放在 feature 根目录；超过约十五个
文件后再按真实 seam 拆分。禁止按技术角色建立全局 `Views/`、`Models/`、`Services/`
垃圾场，也不建立 re-export barrel。

## 依赖方向

```text
App ───────→ Features ───────→ DesignSystem
 │              │
 │              └────→ feature-owned service protocols
 └──────→ Platform ─────────→ implements those protocols
```

- `App` 是唯一 composition root，创建所有长生命周期对象并显式注入。
- Feature 不能直接创建 URLSession、Keychain、通知中心或全局 singleton。
- `Platform` 不拥有产品状态；它只把系统能力适配成 feature 定义的窄接口。
- `DesignSystem` 不依赖 feature、transport 或 persistence。
- 跨进程 wire contract 的 source of truth 仍是 `packages/runtime-protocol` 与
  `packages/mobile-relay-protocol`。Swift wire model 必须由可校验的生成步骤产生，不能在
  多个 feature 手抄一套相似 JSON 结构。

Pairing 是第一个完整纵向切片：`PairingCodeDecoder` 只负责边界校验，`PairingModel` 只负责
页面状态，`DirectPairingClient` 负责一次认证生命周期，`KeychainHostRepository` 负责持久
身份。E2EE schema 与 domain constant 从 TypeScript source of truth 生成 Swift wire model；
domain model 不向 UI 暴露 wire 类型。

## 状态与并发

- SwiftUI 状态使用 `@State`、`@Binding`、`@Observable` 和 `@Environment`。
- 一个状态只有一个 mutation owner；派生值在读取时计算，不建立镜像状态。
- 页面和 coordinator 运行在 MainActor。网络、加密、磁盘和 terminal frame pipeline
  使用 actor 隔离，并向 UI 发送值语义 snapshot。
- 异步页面加载使用 `.task` / `.task(id:)`。取消是正常控制流，不显示成错误。
- 不使用生产 `shared` singleton。依赖从 `AppDependencies.live()` 一次构造。
- List、ForEach 与 navigation route 使用稳定领域 ID，不使用数组下标。

## 导航与展示

- 根导航由 `AppModel` 持有，route 是可穷举的值类型。
- 由选择驱动的 sheet 使用 `.sheet(item:)`，不用成组布尔值表达互斥页面。
- iPhone 使用 `NavigationStack`；需要主从布局的 feature 在 iPad 上使用
  `NavigationSplitView`，不维护两套业务状态。
- Deep link 先解析成 typed intent，再由当前 feature 决定是否能够执行。

## Terminal renderer

Terminal 的 wire transport、session state 与 renderer 必须分离：

```text
TerminalMultiplexTransport actor
  → TerminalSession coordinator
    → TerminalSurface protocol
      → SwiftTermSurface
```

当前技术决策是 pin SwiftTerm 1.18.0，并由 Yiru 自己维护正式的 `UIViewRepresentable`
adapter；首版使用默认 Core Text/Core Graphics renderer，性能数据证明有收益后再评估 Metal。
`WKWebView + xterm.js` 只作为 prototype 未通过时的功能保真回退，Ghostty 与自研 renderer
暂不采用。完整证据和验收闸门见
[`docs/terminal-technology-research.md`](./docs/terminal-technology-research.md)。

Renderer 只接收有序 bytes、snapshot、resize 与输入回调。它不知道 WebSocket、relay、epoch
或 ACK；只有 output 完成 parser feed 后 transport 才能推进 ACK。

## 文件和 API 边界

- Swift 文件目标上限 300 行；SwiftUI 文件 400 行。达到上限说明职责需要沿 seam 拆分。
- 只被一个 View 使用的 helper 留在同一文件；出现第二个真实 caller 再提取。
- 跨 feature 的 API 应小于其隐藏实现。不要创建只转发一个系统 API 的浅 wrapper。
- 用户可见字符串进入 string catalog；View 使用 localized key 或 `String(localized:)`。
- 任何路径、runtime、git 或 terminal 能力都通过已选择 host 的 runtime transport，不能
  假设运行目标就是手机或本地 Mac。

## 验证

仓库合同禁止测试文件，因此本包不建立 XCTest 或 Swift Testing target。每个迁移切片使用：

1. `swift-format` 严格 lint。
2. XcodeGen 可重复生成工程。
3. Swift 6 strict-concurrency 的 Simulator build。
4. 真机/Simulator 手动验收清单。
5. 对滚动、启动、terminal 与 transcript 热路径做 Instruments / SwiftUI 性能分析。
