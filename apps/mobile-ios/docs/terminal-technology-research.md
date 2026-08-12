# iOS 26 Terminal 技术选型

调研日期：2026-08-13。范围是 Yiru 原生 iOS 26 客户端里的交互式远程 terminal，
不是本地 shell。证据只取 Apple 官方文档和候选项目的官方仓库、源码、release 与 license。

## 结论

首选 **SwiftTerm v1.18.0**，由 Yiru 自己提供很薄的 `UIViewRepresentable` adapter，
首版使用 SwiftTerm 默认 Core Text/Core Graphics 路径，完成真实负载 profiling 后再决定是否开启
它的 Metal renderer。

这不是“所有维度最先进”的选择，而是目前唯一同时满足以下条件、且不要求 Yiru 自己造半个
terminal 的方案：

- 原生 iOS `UIView`，已有 `UITextInput`、软键盘/IME、硬件键盘、选择/复制、链接和
  VoiceOver reading-content 实现；
- VT/Xterm 状态机可以直接消费 Yiru terminal multiplex 的 UTF-8 字节流；
- Swift Package Manager 可集成，MIT 许可；
- 绘制既有 CPU 路径，也已有可选 iOS Metal 路径；
- 不引入网页 document、JavaScript bridge 和 Web Content process 生命周期。

两个保留项必须在 prototype 闸门里解决，不能靠推测上线：

1. SwiftTerm 自带的 SwiftUI view 位于 `#if DEBUG`，源码也称其为 testing wrapper；Yiru
   必须拥有正式 adapter，不能直接依赖这个类型。[SwiftUI wrapper 源码](https://github.com/migueldeicaza/SwiftTerm/blob/v1.18.0/Sources/SwiftTerm/iOS/SwiftUITerminalView.swift)
2. v1.18.0 的 package manifest 是 Swift tools 5.9、`swiftLanguageVersions: [.v5]`。Yiru
   app 仍保持 Swift 6.3/严格并发，但依赖本身不是 Swift 6 language mode；所有跨线程调用
   必须隔离在 Yiru adapter 后面。[v1.18.0 Package.swift](https://github.com/migueldeicaza/SwiftTerm/blob/v1.18.0/Package.swift)

如果 SwiftTerm 未通过下方 prototype 闸门，回退方案是 **WKWebView + xterm.js 6.0**，因为
它最接近当前 Expo Mobile 的实际行为。Ghostty 不是当前回退方案；等完整、版本化、支持 iOS
的 libghostty renderer/host API 出现后再重评。

## Yiru 的硬约束

renderer 不是 transport owner。新客户端仍须完整实现仓库现有
[`terminal-multiplex`](../../../docs/reference/terminal-multiplex.md) 合同：

- v1 frame 有 40-byte little-endian header、epoch、route、sequence、correlation 和原始
  payload；默认单 payload 上限 64 KiB、硬上限 1 MiB；
- Output 必须保持顺序，只有 renderer **完成解析**后才能累计 ACK；UI 已画完不是 ACK 条件；
- Input 有 user input 与 terminal query reply 两种 kind，不能混为一类；
- authoritative snapshot 包含 normal scrollback、normal screen、alternate screen、active
  buffer、尺寸、pending escape tail 和 metadata；解析完成前不能 ACK snapshot；
- iOS suspend、sequence gap、relay move 和重连都走同一个 snapshot recovery seam；
- 现有 transport 会做 credit/backpressure。renderer 只能报告 parsed sequence 和自己的
  receiver queue bytes，不能再建立无界缓存。

对应实现证据是现有 [frame codec](../../../packages/runtime-protocol/src/terminal-multiplex/frame.ts)、
[mobile delivery state machine](../../mobile/src/transport/terminal-multiplex/delivery.ts)、
[snapshot assembler](../../mobile/src/transport/terminal-multiplex/snapshot.ts) 和
[renderer bridge contract](../../mobile/src/terminal/webview/contract.ts)。原生迁移应先移植这些
协议语义，再接 renderer；不能让第三方组件定义 wire contract。

建议的边界：

```text
TerminalMultiplexTransport actor
  └─ ordered bytes / snapshot / credits / ACK
       └─ TerminalSession coordinator
            └─ TerminalSurface protocol
                 └─ SwiftTermSurface (UIViewRepresentable + Coordinator)
```

`TerminalSurface` 只暴露 `feed(bytes)`、`restore(snapshot)`、`resize`、`clear`、focus、selection
和 input/query-reply/link callbacks。它不知道 WebSocket、epoch 或 relay。这条 seam 让我们能在
不改 feature 和 transport 的前提下替换 renderer。

## 候选总览

| 方案 | iOS 交互完成度 | VT/ANSI | 原生/无障碍 | 集成成本 | 主要阻断项 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| SwiftTerm v1.18.0 | 高 | 高 | UIKit 原生，已有 iOS 输入与 reading content | 低到中 | Swift 5 mode；线程和 snapshot parity 要实测 | **首选** |
| libghostty-vt | 低 | 很高 | 只有状态层，UI 全部自建 | 很高 | 完整 Ghostty 不支持 iOS；API 未稳定/未版本化 | 暂不采用 |
| WKWebView + xterm.js 6.0 | 中到高 | 高 | Web accessibility，非原生 text view | 中 | JS bridge、进程恢复、二进制复制与现有复杂度继续存在 | 回退 |
| 自研 TextKit/Core Text/Metal | 取决于投入 | 从零实现 | 可以做到最好，但全部由 Yiru 承担 | 极高 | parser、grid、Unicode、IME、选择、a11y、renderer 都要造 | 不采用 |

针对现有 multiplex byte/snapshot stream：

| 方案 | live Output/Input | authoritative snapshot | ACK/backpressure |
| --- | --- | --- | --- |
| SwiftTerm | raw output bytes 可直接 `feed`；delegate bytes 可编码为现有 Input record | 可复用现有 ANSI 双屏 replay，但必须验证 buffer parity 并抑制历史 query reply | `feed` 同步返回可作为 parsed barrier；credit/ACK 仍由 Yiru transport 拥有 |
| libghostty-vt | C API 能消费/产生 terminal bytes，但要写 Swift ownership 与 renderer bridge | 可 ANSI replay，或另造 Ghostty-native snapshot adapter；后者会形成第二份恢复语义 | parser barrier 可接，但 queue、render completion 和 receiver pressure 都要自建 |
| xterm.js | 正是当前 Mobile 的 string/`Uint8Array` write 与 JS input callback | 当前实现已使用 xterm ANSI 双屏 replay，行为最接近现状 | 已有 parse callback bridge，但继续承担 Swift/JS queue 和 Web process 恢复 |
| 自研 | wire codec 可以直接接 raw bytes | 所有 VT state/replay correctness 都由 Yiru 从零承担 | 最自由，也最容易错误 ACK 或形成无界 UI queue |

## 1. SwiftTerm

### 维护、许可与集成

官方最新 release 是 [v1.18.0（2026-08-09）](https://github.com/migueldeicaza/SwiftTerm/releases/tag/v1.18.0)，
release 包含 selection API 的公开化；仓库 README 说明它用于多个已发布 iOS SSH 客户端。
它通过 SPM 发布 `SwiftTerm` library，最低 iOS 14，因此 iOS 26 没有 deployment blocker。
许可证是 [MIT](https://github.com/migueldeicaza/SwiftTerm/blob/v1.18.0/LICENSE)。

v1.18.0 package 会打包 Metal shader resource，并解析两个 Apple package dependency；它不是
预编译 binary。好处是 Xcode 能直接构建、符号化和审计；代价是首次解析/编译时间和上游源码
变化都进入 app build。应精确 pin `1.18.0`，升级必须重新跑本文件的验收清单，不跟随 `main`。

### VT、Unicode 与渲染

官方 README 将其描述为可嵌入 iOS 的 VT100/Xterm emulator，列出 ANSI/256/TrueColor、
mouse reporting、OSC hyperlinks、Unicode/emoji/combining characters、双向文本、Sixel、
iTerm2/Kitty graphics 和 search；核心与 UI 分层，并且 `TerminalView.feed` 可接收原始
`ArraySlice<UInt8>`。[项目 README](https://github.com/migueldeicaza/SwiftTerm/tree/v1.18.0#features)

iOS view 默认使用项目已有的 Apple text renderer；`setUseMetal(_:)` 可以改用 Metal，官方
源码明确写着 Metal **默认关闭**，初始化失败会抛错。
[iOS renderer switch](https://github.com/migueldeicaza/SwiftTerm/blob/v1.18.0/Sources/SwiftTerm/iOS/iOSTerminalView.swift)
因此首版先用默认路径建立正确性和 Instruments baseline；Metal 是同一组件内的可逆优化，
而不是架构前提。

### 输入、选择、链接与 accessibility

`TerminalView` 是 `UIScrollView`，遵循 `UIKeyInput`、`UITextInputTraits` 和 pointer interaction；
独立的 [iOSTextInput.swift](https://github.com/migueldeicaza/SwiftTerm/blob/v1.18.0/Sources/SwiftTerm/iOS/iOSTextInput.swift)
实现 marked text 与 `setMarkedText`/`unmarkText`，这正是 Apple 对拼音、日文等多阶段输入的
协议要求。[Apple `UITextInput`](https://developer.apple.com/documentation/uikit/uitextinput)
硬件特殊键由 `pressesBegan` 映射；普通硬件键盘文本仍经 text input 路径。

iOS view 实现 selection、系统 copy/paste action、context menu、pointer/hover 和 OSC 8/隐式
链接回调；URL 最终由 Yiru 校验 scheme 并决定是否打开，不能让 terminal output 直接导航。
源码也实现 `UIAccessibilityReadingContent` 风格的 line/page/frame 方法和 accessibility
scroll。[iOS TerminalView](https://github.com/migueldeicaza/SwiftTerm/blob/v1.18.0/Sources/SwiftTerm/iOS/iOSTerminalView.swift)
Apple 说明 reading-content protocol 能让 VoiceOver 连续阅读并按页滚动。
[Apple `UIAccessibilityReadingContent`](https://developer.apple.com/documentation/uikit/uiaccessibilityreadingcontent)

这些是“已有实现”，不是“已证明满足 Yiru 的质量线”。SwiftTerm README 自己仍把 selection/
accessibility 列为相对弱项；VoiceOver、动态字体、中文选择手柄和外接键盘布局都必须真机验收。
如要补系统选择体验，Apple 建议自定义 `UITextInput` view 使用 `UITextInteraction` 或
`UITextSelectionDisplayInteraction`，不应在 SwiftUI overlay 里再造一套手势。
[Apple custom text selection](https://developer.apple.com/documentation/uikit/adopting-system-selection-ui-in-custom-text-views)

### SwiftUI adapter 与线程风险

Apple 的正式集成点是 `UIViewRepresentable`：SwiftUI 管理 UIKit view 的布局，Coordinator
转发 delegate 事件，dismantle 时清理资源。
[Apple `UIViewRepresentable`](https://developer.apple.com/documentation/swiftui/uiviewrepresentable)

Yiru adapter 必须：

- 创建并长期持有一个 `TerminalView`，不能在 `updateUIView` 重建或重放状态；
- Coordinator 实现 `TerminalViewDelegate`，把 resize、input、query reply、link、clipboard、
  bell 和 title 转成 typed callbacks；
- `dismantleUIView` 解除 delegate、取消订阅并清空 queued output；
- 不手动写 SwiftUI 所管理的 frame/bounds；
- 在 feature 内保持 renderer identity 稳定，tab 切换只调 delivery state。

上游源码称 `feed` 可从后台线程调用，但同一源码对用户输入状态有“input 与 feed 必须在同一
processing thread”的约束。首个 prototype 应在 MainActor 串行调用 feed/input，确认正确性；
同时用 30 分钟 flood 和真实 TUI 测 main-thread 占用。如果卡顿，不得直接并发调用同一个 view，
而应先与上游确认线程模型或维护一个窄 fork。
[AppleTerminalView feed/input source](https://github.com/migueldeicaza/SwiftTerm/blob/v1.18.0/Sources/SwiftTerm/Apple/AppleTerminalView.swift)

### 与 multiplex 的兼容性

兼容性总体高，但 adapter 需要处理四个细节：

1. Output payload 直接以 bytes 喂 `feed(byteArray:)`，避免 String 往返；`feed` 同步返回后才算
   parser complete，随后才能推进 Output ACK。
2. UIKit user input 与 VT parser 产生的 terminal query reply 最终都会触发 delegate send。
   Coordinator 必须按“当前是否位于 feed 调用栈”分类：输入发 kind 0，解析响应发 kind 1；
   无法可靠分类就是 prototype 失败。
3. snapshot replay 期间，历史 ANSI 可能生成 query reply。必须抑制这些副作用，按合同依次
   恢复 normal/alternate/active buffer，把 `pendingEscapeTail` 放在最后，然后才 ACK。
4. resize 必须报告真实 cell 尺寸变化，并验证 normal scrollback reflow、alternate-screen
   repaint 和 input credit，不可以把 `UIView` point size 当 columns/rows。

## 2. Ghostty / libghostty

Ghostty 的 terminal core 很有吸引力：官方 README 称其解析和状态实现经过真实 Ghostty 负载，
`libghostty-vt` 是零依赖的 C/Zig library，并提供 render-state、input encoding、selection、
search 和 snapshot 等 API。[Ghostty README](https://github.com/ghostty-org/ghostty#cross-platform-libghostty-for-embeddable-terminals)
仓库为 [MIT](https://github.com/ghostty-org/ghostty/blob/main/LICENSE)。

但“把 Ghostty 嵌进 SwiftUI”目前不是一个完整 iOS 组件：

- Ghostty build config 明确拒绝完整 Ghostty 的 iOS target，只有 `libghostty-vt` 支持 iOS。
  [官方 build guard](https://github.com/ghostty-org/ghostty/blob/main/src/build/Config.zig)
- `libghostty-vt` 顶层源码明确警告 API 不保证稳定；README 也说尚未打 library version，API
  signature 仍在变化。[lib_vt.zig](https://github.com/ghostty-org/ghostty/blob/main/src/lib_vt.zig)
- 官方 Ghostling 示例说明 lib 提供解析、terminal state 和 renderer state，真正 drawing 与
  windowing 由 consumer 实现；示例本身也明确不是 daily-use terminal。
  [Ghostling README](https://github.com/ghostty-org/ghostling#what-is-libghostty)
- 虽然 build 能产出 device/simulator 的 `ghostty-vt.xcframework`，Yiru 仍需维护 Zig toolchain、
  C ABI/headers、Swift ownership wrapper、font shaping/atlas、Metal renderer、`UITextInput`、
  selection UI、clipboard/link policy 和 accessibility tree。
  [XCFramework build source](https://github.com/ghostty-org/ghostty/blob/main/src/build/GhosttyLibVt.zig)

因此它是“优秀 VT engine + 自研 iOS frontend”，不是 SwiftTerm 的同类 turnkey 选择。其 VT
正确性与性能潜力不足以抵消当前 API、binary 和 UI 工程风险。保留 `TerminalSurface` seam，
待官方提供版本化 iOS host/renderer 或出现成熟的一方 iOS wrapper 后再做 prototype。

## 3. WKWebView + xterm.js

xterm.js 是成熟的 browser terminal。官方 README 列出 bash/vim/tmux、curses、mouse、
CJK/emoji/IME、screen-reader mode、minimum contrast、selection、links，以及可选 GPU renderer；
core 零依赖。[xterm.js README](https://github.com/xtermjs/xterm.js#features)
最新正式版是 [6.0.0（2025-12-22）](https://github.com/xtermjs/xterm.js/releases/tag/6.0.0)，
许可证是 [MIT](https://github.com/xtermjs/xterm.js/blob/6.0.0/LICENSE)。其 public API 直接支持
`write(string | Uint8Array)`、`onData`/`onBinary`、selection 和 link provider。
[public typings](https://github.com/xtermjs/xterm.js/blob/6.0.0/typings/xterm.d.ts)

在 iOS 里需要 `WKWebView` 承载。Apple 将其定义为呈现 HTML/CSS/JavaScript 的原生 view，
而不是原生 text control；native/JS 通信通过 script message handler 和 JavaScript evaluation。
[Apple `WKWebView`](https://developer.apple.com/documentation/webkit/wkwebview)、
[script message handler](https://developer.apple.com/documentation/webkit/wkusercontentcontroller/addscriptmessagehandler%28_%3Acontentworld%3Aname%3A%29)

优点：

- 与现有 Expo Mobile 的 xterm 行为、snapshot replay 和已知 terminal app 兼容性最接近；
- VT、IME、selection、links、accessibility 和 WebGL 已有大量上游投入；
- 若 SwiftTerm 有 blocker，它是最快的功能保真回退。

代价：

- Swift ↔ JavaScript message queue、对象/字符串转换和 parse completion callback 继续存在；
- Web Content process 终止后要重建 document、握手 readiness，再通过 authoritative snapshot
  恢复；这正是当前 mobile 已经维护的复杂状态；
- accessory bar、系统 edit menu、VoiceOver 和 focus 由 web DOM 与 UIKit 两层共同决定；
- JS/CSS/addon bundle 要被锁定、离线打包、做 license inventory，并禁止任意 navigation；
- optional WebGL addon 的 GPU 路径仍运行在 WebKit，不等价于原生 Metal surface。

如果走回退方案，应直接移植当前 proven xterm engine 与 multiplex bridge，而不是重新发明一版
Swift-to-JS protocol；同时使用独立 `WKContentWorld` 隔离 app script。Apple 将 content world
描述为隔离的 JavaScript sandbox。
[Apple WWDC20](https://developer.apple.com/videos/play/wwdc2020/10188/?time=285)

## 4. 自研 TextKit / Core Text / Metal

这些是互补的系统技术，不是 terminal 组件：

- TextKit 是 UIKit/AppKit 的文本布局与渲染系统；标准 `UITextView` 会自动得到编辑、选择和
  find，但 terminal 是二维 cell grid、双 buffer 与 VT state machine，不能把 transcript 当
  普通 attributed text。[Apple TextKit](https://developer.apple.com/documentation/uikit/textkit)、
  [Apple `UITextView`](https://developer.apple.com/documentation/uikit/uitextview)
- Core Text 是高性能低层 glyph/layout API，能提供 font fallback、metrics、shaping 和 runs；
  layout object 有单-operation/queue 的线程约束。
  [Apple Core Text](https://developer.apple.com/documentation/coretext)
- `MTKView`/`CAMetalLayer` 提供 drawable 与 render pass，不提供 VT parser、Unicode cell width、
  glyph atlas、input、selection 或 accessibility。
  [Apple `MTKView`](https://developer.apple.com/documentation/metalkit/mtkview)、
  [custom Metal view](https://developer.apple.com/documentation/metal/creating-a-custom-metal-view)

完整方案至少要自己维护 VT parser、normal/alternate buffers、scrollback/reflow、grapheme 与
wide-cell 规则、BiDi/shaping、ANSI attributes、mouse/kitty keyboard、graphics protocols、
glyph atlas/cache、dirty-region renderer、soft keyboard/IME、hardware keyboard、selection、
paste、links、VoiceOver reading model、Dynamic Type 和 reduced motion/contrast。这个投资只有在
SwiftTerm 和 xterm.js 都有已量化且无法上游修复的瓶颈时才合理；当前没有这种证据。

## Prototype 方案

只做一个纵向切片，不写 test target 或 test file：

1. 在 `Features/Terminal/` 定义 renderer-neutral session/surface contract；
2. SPM pin SwiftTerm `1.18.0`；用 Yiru-owned `UIViewRepresentable` 包装 `TerminalView`；
3. 先接本地 deterministic fixture/recording，再接一个真实 multiplex terminal；
4. 默认 renderer 建 correctness baseline，再用相同 recording 开 Metal 对照；
5. Instruments 记录 SwiftUI hangs、Time Profiler、Allocations、Metal/GPU 与 Energy；
6. 所有协议异常都进入现有 recovery 状态机，不在 view 内私自重连。

### 不使用测试文件的验收清单

构建与依赖：

- [ ] iOS 26 Simulator 与至少一台真机可用 Swift 6 strict-concurrency 构建；无新增 test target。
- [ ] `Package.resolved` 精确解析 SwiftTerm 1.18.0；About/Licenses 包含 SwiftTerm MIT notice。
- [ ] app target 不依赖 SwiftTerm 的 DEBUG-only SwiftUI wrapper。

VT 与 transport：

- [ ] `bash/zsh`、vim、tmux、top/htop 类 fullscreen TUI、ANSI 16/256/true color、光标形态、
  scroll region 和 mouse reporting 可用。
- [ ] Output 只有在 `feed` 返回后 ACK；30 分钟 flood 下 queue/credit 有界、无 ACK stall。
- [ ] user input 发 kind 0；DSR/DA/OSC 等 parser query reply 发 kind 1；snapshot replay 不发送
  历史 query reply。
- [ ] 输入和 Output 都覆盖拆分 UTF-8、CJK wide cell、emoji、combining mark、Arabic/BiDi。
- [ ] normal/alternate 双屏 snapshot、pending escape tail、clear、gap、resize、relay move、前后台
  10 秒/2 分钟/15 分钟恢复后画面与 host model 一致。
- [ ] columns/rows 只在有效 cell metrics 后发送；旋转、Stage Manager 与 iPad 分屏无 resize loop。

输入与交互：

- [ ] 中文拼音、日文、韩文、emoji、听写的 marked text 不重复、不丢字，candidate window 位置合理。
- [ ] Magic Keyboard/蓝牙键盘覆盖 Escape、Tab、方向键、Home/End、Page Up/Down、Fn、
  Control/Option/Command 组合和 key repeat。
- [ ] bracketed paste、纯文本 paste、大段 paste、copy/select all、selection handles、loupe、
  scrollback selection 与 application mouse mode 有明确且一致的优先级。
- [ ] OSC 8 与检测 URL 只通过 Yiru URL policy 打开；`javascript:`、`file:` 和未知 scheme 被拒绝。

可访问性与视觉：

- [ ] VoiceOver 能逐行/逐页读取可见 terminal、滚动并宣布 selection；大量输出不会刷屏或卡死。
- [ ] Reduce Motion、Increase Contrast、Reduce Transparency、Bold Text、最大 Dynamic Type、
  light/dark mode 下 terminal 与 accessory controls 可用。
- [ ] terminal 内容层不使用 Liquid Glass；只有外部 toolbar/accessory controls 使用系统 glass。

性能与稳定性：

- [ ] 默认 renderer 和 Metal 各跑同一 30 分钟 flood；记录 main-thread frame misses、CPU、GPU、
  peak/steady memory、energy 和 thermal state，数据决定是否启用 Metal。
- [ ] 快速 input echo、每秒高频 output、10k+ scrollback、反复 tab 切换/selection/旋转不崩溃。
- [ ] SwiftUI update 不重建 `TerminalView`；离屏 parked terminal 降低 delivery credit 且不持续 redraw。
- [ ] memory warning、scene background/foreground 和 transport reconnect 后无 stale delegate、双订阅或
  terminal 内容进入日志/telemetry。

## 风险与处置

| 风险 | 触发证据 | 处置/回退 |
| --- | --- | --- |
| SwiftTerm parser/feed 阻塞 MainActor | flood 或 TUI 造成明显 hang/frame miss | 先确认上游线程合同；必要时窄 fork；无法安全隔离则回退 xterm.js |
| Swift 5 dependency 与严格并发边界不安全 | Sendable/actor warning、输入与 feed race | 所有调用留在 adapter 的单 executor；不把 SwiftTerm object 暴露给 feature |
| snapshot 与 SwiftTerm 双 buffer 不一致 | restore 后 screen、scrollback 或 tail parity 失败 | 不上线；先实现结构化 replay/suppress side effects，无法修复则回退 xterm.js |
| accessibility/IME 不达标 | 真机验收失败 | 优先贡献/维护窄上游 patch；短期回退 xterm.js，不自造 overlay selection |
| Metal 更快但更耗能/有 glyph 差异 | profile 或 visual parity 不通过 | 保持默认 renderer；Metal 用 feature flag/canary，不作为发布前提 |
| 上游 API/行为漂移 | SwiftTerm upgrade | 精确 pin；每次升级人工跑完整清单并检查 release/source diff |
| 将来切 Ghostty 成本过高 | libghostty 出现稳定 iOS host API | `TerminalSurface` seam 保持 transport/feature 不变，单独做有数据的替换 prototype |

最终决策是：**现在用 SwiftTerm，把选择权留在 Yiru 的 seam 里；不要现在为 Ghostty 补齐整个
iOS frontend，也不要把当前 WKWebView 架构原样带进原生重写。**
