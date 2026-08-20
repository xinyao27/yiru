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
  `packages/mobile-relay-protocol`。Swift wire model 应当从这些 source of truth 生成而非
  在多个 feature 手抄一套相似 JSON 结构；此前生成加漂移校验由
  `generate-mobile-ios-wire-contracts.mjs` 自动执行，该脚本已被删除，目前这条规则只能靠人工
  在改动协议时同步维护 `MobileWire.generated.swift`。

Pairing 是第一个完整纵向切片：`PairingCodeDecoder` 只负责边界校验，`PairingModel` 只负责
页面状态，`DirectPairingClient` 负责配对用例，`KeychainHostRepository` 负责持久身份。
`AuthenticatedRuntimeConnection` 集中拥有公钥钉扎、E2EE 握手和 cipher counter，配对与后续
runtime capability 不各写一套 transport。E2EE 和移动工作区 schema、domain constant、oRPC
method identifier 从 TypeScript source of truth 生成 Swift wire model；domain model 不向 UI 暴露
wire 类型。

`RuntimeHostSession` 是每个 host 唯一的物理连接 owner，负责连接代际、heartbeat、退避和恢复；
`RuntimeOrpcPeer` 是加密流唯一的 reader，并按 request ID 分发 unary response 与 event iterator；
iterator 严格遵循锁定 oRPC 版本的 response、message/error/done 和 abort frame 生命周期。
`RuntimeClient` 只维护 stable logical session 与值语义 snapshot，再把窄 capability protocol 提供给 feature。当前产品已
退役第一方 Cloud Relay，因此原生端保留旧 pairing field 的边界校验，但不会重新引入已删除的
provisioning、credential rotation 或 relay endpoint lifecycle。

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
- Home 和非 Workspace 路由使用 `NavigationStack`；Workspace 路由始终由同一个
  `NavigationSplitView` composition root 承载。iPhone 使用系统的紧凑单列适配，iPad
  展示主从栏；窗口尺寸变化只改变列可见性，不替换导航根，也不重建 Session/Terminal
  状态。
- Deep link 先解析成 typed intent，再由当前 feature 决定是否能够执行。

## Terminal renderer

Terminal 的 wire transport、session state 与 renderer 必须分离：

```text
RuntimeTerminalMultiplexer actor (one per host)
  → TerminalBulkConnection actor (one E2EE epoch, many routes)
    → TerminalSession coordinator (one route)
    → TerminalSurface protocol
      → SwiftTermSurface
```

当前实现 pin SwiftTerm 1.18.0，并由 Yiru 自己维护正式的 `UIViewRepresentable` adapter 与
renderer-neutral `TerminalSurface`；首版使用默认 Core Text/Core Graphics renderer，性能数据
证明有收益后再评估 Metal。
`WKWebView + xterm.js` 只作为 prototype 未通过时的功能保真回退，Ghostty 与自研 renderer
暂不采用。完整证据和验收闸门见
[`docs/terminal-technology-research.md`](./docs/terminal-technology-research.md)。

Renderer 只接收有序 bytes、snapshot、resize 与输入回调。它不知道 WebSocket、relay、epoch
或 ACK；只有 output 完成 parser feed 后 transport 才能推进 ACK。

每个 host 的 terminal multiplexer 复用一条 bulk socket，并从 server epoch 接受
`maxStreams` 上限后分配单调递增 route ID。帧只投递给对应 route；一个 terminal 结束或出现
route-level 错误不会关闭其他 terminal，最后一个 route 释放后才关闭空闲 bulk。bulk epoch、
控制连接 generation 或后台时效失效时，所有 route 一起失败，各页面重新执行
`show → ticket → E2EE bulk → authoritative snapshot`，不复用旧 parser sequence。

Terminal 控制面的 `status/list/show/openMultiplex` 使用 runtime-protocol 中的原生客户端投影，
由同一个 drift-checked generator 产出 Swift `Codable` 类型。inner frame 的 kind、version、header
大小、frame cap 与 opcode 同样来自 TypeScript source of truth；`TerminalMultiplexFrameCodec` 只负责
严格 little-endian frame 边界，不承担 session、flow-control 或 renderer 状态。

Workspace session 以 `session.tabs` publication 为唯一 tab 权威源；本地只拥有 pending selection、
短期 close tombstone 和已访问 terminal surface 集合。`publicationEpoch + snapshotVersion` 拒绝同一
publisher 的倒序 snapshot，隐藏 tab 保留 renderer，但将 terminal delivery interest 降为 background。

Terminal 与 Native Chat 共用同一个 `TerminalLiveModel`。连接状态和 terminal action notice 由
feature-owned status overlays 渲染在 composition surface 上，而不是绑定到 terminal renderer
的可见性；因此切换 Chat/Terminal、窄宽布局或 iPad master-detail 时，重连、retry、Stop 失败和
其他 transient feedback 都仍然可见，并且不会推开 transcript 或 composer 的布局。

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
