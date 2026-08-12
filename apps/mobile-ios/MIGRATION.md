# Expo to native iOS migration

迁移以可独立验收的纵向切片推进，不按“先写完所有 model，再写所有 UI”的横向层次推进。
旧 `apps/mobile` 在功能对齐前保持可运行；新功能不再为 Android 增加实现。

## 顺序

| 阶段 | 原生 feature | 对应现有范围 | 完成标准 |
| --- | --- | --- | --- |
| 0 | Foundation | app shell、theme、glass、navigation | Design System catalog、Swift 6 build、架构合同 |
| 1 | Transport + Pairing | `transport/`、pair / scan / confirm、connection log | 直连、E2EE、Keychain、断线恢复行为一致；不复活已退役 Cloud Relay |
| 2 | Hosts + Workspaces | `home/`、`workspace/`、`workspace-create/`、host edit/accounts | host/worktree 浏览、创建与操作一致 |
| 3 | Session + Terminal | `session/`、`terminal/` | terminal multiplex、tabs、输入、恢复与设置一致 |
| 4 | Native Chat | session native-chat、attachments、tool details | transcript、streaming、tool approval、resume 一致 |
| 5 | Source Control | `source-control/`、`review/`、PR routes | status、diff、stage、commit、review、PR 一致 |
| 6 | Files + Browser | `files/`、`browser/` | tree、search、preview、artifact/browser 一致 |
| 7 | Agent History + Activity | `agent-history/`、history、activity insights | filter、resume、usage insights 一致 |
| 8 | Notifications + Widgets | notifications、widgets、deep links | push、routing、WidgetKit timeline 一致 |
| 9 | Settings + Diagnostics | settings、appearance、troubleshoot、about | 所有偏好、诊断和权限行为一致 |
| 10 | Cutover | release metadata、bundle identity、store assets | 性能验收、数据迁移、TestFlight、旧 Expo 退役 |

Terminal renderer 已完成独立调研，阶段 3 默认采用 SwiftTerm 1.18.0 + Yiru-owned SwiftUI
adapter，并以 multiplex/snapshot parity、IME、VoiceOver 和 30 分钟 flood profile 作为原型
闸门；细节见 [terminal-technology-research.md](./docs/terminal-technology-research.md)。

## 协议优先规则

Transport 是后续所有 feature 的地基，不能在 Swift 中凭 UI 需要临时拼 JSON：

1. 从 TypeScript source of truth 生成 Swift `Codable` wire model 和 method identifiers。
2. 生成结果带 source digest，仓库检查发现漂移就失败。
3. 加密 frame、nonce、size limit、terminal multiplex 和 reconnect state machine 逐条移植，
   不改变桌面端协议来迁就 UI。
4. Feature 只消费稳定的 runtime capability client，不接触 WebSocket frame。

## 每个切片的行为账本

开始迁移一个 feature 前，在它的目录写一页 invariants：入口、成功路径、取消路径、错误
路径、持久状态、deep link、background/foreground、权限、离线行为和性能预算。实现后用
同一账本分别操作 Expo 与 SwiftUI 客户端；差异必须是明确的原生交互改进，而不是逻辑丢失。

## 当前状态

- [x] iOS 26 / Swift 6 / XcodeGen 工程基线
- [x] App composition root 与 typed route
- [x] Liquid Glass token、surface、action group 和 catalog
- [x] Terminal renderer 技术选型与 prototype 验收清单
- [x] SwiftTerm 1.18.0、Yiru-owned `TerminalSurface` 与可运行 renderer prototype
- [x] Transport contract generation 与 drift check
- [x] QR / paste / deep-link pairing、E2EE v2 direct authentication 与 Keychain host credential
- [x] Host 列表、重复桌面身份复用与安全凭据读取
- [x] 加密 oRPC unary transport 与 `worktree.ps` 工作区只读列表
- [x] 每 host 长期 logical connection、并发 oRPC dispatch、指数退避与 90 秒 trickle reconnect
- [x] 前台、网络恢复 / 切换唤醒，20 秒 heartbeat 与显式 reconnect
- [x] Terminal 控制面 wire projection、工作区 terminal 列表与 inner frame codec
- [x] Host list 的逐 host 实时状态与显式 reconnect
- [ ] Connection diagnostics log
- [ ] Workspace create、activate、sleep、pin 与 host edit 操作
- [x] Terminal multiplex、双屏 snapshot replay、parse ACK、flow control 与远程 PTY session
- [x] Terminal 断线后重建 ticket / bulk / epoch，并由 authoritative snapshot 自动恢复
- [x] 每 host 共享 terminal bulk、独立 route 生命周期与 server `maxStreams` 限制
- [x] SwiftTerm 原生输入附件、系统 Liquid Glass 快捷键、设备字号与内置键布局持久化
- [x] Server-authoritative Phone Fit / Desktop Size 显示模式同步与切换
- [x] `session.tabs` 权威列表、激活、新建、关闭、版本闸门与后台 terminal surface 保活
- [x] oRPC event iterator 与 `session.tabs.subscribe` 实时跨客户端同步
- [ ] Tab 高级操作与自定义快捷键 parity
- [ ] 其余功能切片
