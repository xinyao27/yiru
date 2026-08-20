# Expo to native iOS migration

迁移以可独立验收的纵向切片推进，不按“先写完所有 model，再写所有 UI”的横向层次推进。
迁移已完成：旧 `apps/mobile`（Expo）已从仓库删除，本目录是唯一的 Yiru 移动端实现。

所有完成状态以 [FUNCTIONAL-PARITY.md](./FUNCTIONAL-PARITY.md) 和机器可读的
[`migration-parity.json`](./migration-parity.json) 为准。下方阶段勾选只表示基础能力已存在，
不能替代逐路由、逐 capability 的 parity 证据。

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
2. 生成结果带 source digest；此前仓库检查（`generate-mobile-ios-wire-contracts.mjs` 及
   `scripts/mobile-ios-wire/` 下的生成器）发现漂移会直接失败，但该脚本已被删除，现在漂移
   不再被自动检测，`MobileWire.generated.swift` 需要在协议变更时手动同步。
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
- [x] Connection diagnostics log、报告复制与 reconnect history
- [x] Workspace activate、sleep、pin/unpin 与删除操作
- [x] Host edit、disconnect 与带持久凭据清理的 remove 操作
- [x] Settings shell、主题、本地偏好、iOS 通知权限与 endpoint 诊断
- [x] Chat / Browser / Loader 偏好接入生产 session、browser 和全局 loader style
- [x] 通知 runtime subscription、断线 catch-up、routing、dismissal 与首次 opt-in
- [x] Workspace 基础创建、Agent 探测、默认 Agent、名称冲突重试与创建后进入 Session
- [x] Workspace Create From、setup hook 信任、repo 搜索与 GitHub/GitLab review/base resolution
- [x] Accounts list/subscribe、Claude/Codex managed account 切换与 usage/reset 状态
- [x] Terminal multiplex、双屏 snapshot replay、parse ACK、flow control 与远程 PTY session
- [x] Terminal 断线后重建 ticket / bulk / epoch，并由 authoritative snapshot 自动恢复
- [x] 每 host 共享 terminal bulk、独立 route 生命周期与 server `maxStreams` 限制
- [x] SwiftTerm 原生输入附件、系统 Liquid Glass 快捷键、设备字号与内置键布局持久化
- [x] Server-authoritative Phone Fit / Desktop Size 显示模式同步与切换
- [x] `session.tabs` 权威列表、激活、新建、关闭、版本闸门与后台 terminal surface 保活
- [x] oRPC event iterator 与 `session.tabs.subscribe` 实时跨客户端同步
- [x] Tab rename/clear/focus/close、custom shortcuts、quick commands 与恢复偏好
- [x] Quick Command 编辑保留已有 Global/Project scope，新增命令才继承当前 workspace 默认 scope
- [x] Activity 统计保留旧版 supplemental token、Cursor metered spend、coverage 说明和可选 sessions 语义；重复日期按旧版规则累加
- [x] Markdown、file、diff、browser 与 native-chat 非 terminal tab
- [x] Native Chat transcript、增量订阅、tool details、AskUserQuestion、附件和草稿
- [x] Source Control status/diff/stage/commit/history/branch/remote/conflict 全操作
- [x] Review notes、AI fix、PR checks/comments/reviewers/merge/auto-merge 与创建/关联 review
- [x] Files tree/search/preview、Terminal Artifact 编辑保存和终端行列链接
- [x] Agent History filter/resume、folder/project-group 安全解析与 Activity Insights；Native 请求旧版 500 条窗口并通过 Desktop `compact` projection 保留最近预览、去除 Activity 专属 usage payload，避免加密 WebSocket 单帧超限
- [x] WidgetKit provider usage、token usage 与 workspace status widgets
- [x] Expo AsyncStorage / SecureStore 偏好与凭据迁移
- [x] Expo home snapshot 到原生冷启动缓存的 schema-aware migration adapter
- [x] Expo per-host pinned-workspace overlay migration with server-authoritative retry
- [x] 29/29 旧路由、126/126 旧 runtime capability、12/12 系统集成账本收口
- [ ] 真实桌面 host 并排验收、30 分钟 terminal/browser 压测与真机 Instruments profile
- [ ] TestFlight、发布签名、商店素材与 Expo 版 cutover
