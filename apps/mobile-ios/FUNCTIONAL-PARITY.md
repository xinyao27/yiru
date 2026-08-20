# Native iOS functional parity

`apps/mobile` 是功能、交互和视觉细节的基准，`apps/mobile-ios` 只有在同一条用户路径的
正常、取消、失败、断线、恢复、后台切换和持久化行为都具备实现证据后，才能标记为完成。
原生平台交互可以更符合 iOS 26，但不能删除功能或改变业务语义。

机器可读状态位于 [`migration-parity.json`](./migration-parity.json)。曾有仓库检查
（`check-mobile-ios-parity-ledger.mjs`）直接扫描 Expo 路由和 runtime capability，任何未登记的旧功能
都会让 `pnpm check` 失败；该脚本已随其余仓库契约脚本一起被删除，现在 `pnpm check` 不再校验这份账本，
`migration-parity.json` 只是留存的记录，不再有自动核对。

## 状态定义

- `complete`：生产 adapter、用户界面、持久化和相关异常路径均已实现，并在账本中列出证据。
- `partial`：只有部分子路径可用，不得作为迁移完成对外宣称。
- `missing`：尚无可交付的原生实现。

页面存在、能编译或只有 fixture 都不构成 `complete`。重定向路由也必须等目标功能完成后
才能完成。DEBUG fixture 用于逐状态视觉核对，不能替代真实 runtime 验收。

## 当前结论

功能迁移的代码账本已经收口：旧 Expo Mobile 的 29 个路由、126 个实际 runtime
capability，以及 12 个系统集成项均记录为 `complete`。此前的账本检查会要求所有条目保持完成——
旧端新增路由或 capability、证据文件丢失、或任一条目退回 partial/missing 都会直接失败——但该检查脚本
已被删除，现在这份收口状态不再被自动核验，仅作为人工记录保留。

| 功能域 | 当前状态 | 主要原生实现 |
| --- | --- | --- |
| App shell 与 Home | Complete | typed navigation、recent workspace、usage/activity、deep link、离线快照 |
| Pairing 与 Transport | Complete | QR/paste/deep link、E2EE、Keychain、重连、connection log |
| Hosts 与 Workspaces | Complete | 列表、创建来源、setup trust、accounts、生命周期与跨客户端 tab 状态 |
| Session 与 Terminal | Complete | SwiftTerm、multiplex、tab、恢复、快捷键、附件、显示模式与焦点操作 |
| Native Chat | Complete | transcript、流式增量、tool details、AskUserQuestion、草稿、附件与发送确认 |
| Source Control 与 PR | Complete | status/diff/stage/commit/history、review notes、hosted review 与 GitHub PR 操作 |
| Files 与 Browser | Complete | tree/search、preview、artifact 编辑、行列定位与远程浏览器输入 |
| Agent History 与 Activity | Complete | session filter/resume、旧 worktree 路径兼容与 usage insights |
| Notifications 与 Widgets | Complete | 权限、订阅、catch-up、routing、dismissal、App Group snapshot 与三个 WidgetKit widget 设计 |
| Settings 与 Diagnostics | Complete | 偏好接入生产功能、旧数据迁移、troubleshooting 与诊断报告 |

`runtime.mutationRevisions.get/set` 没有列入 capability 总数：它们是旧 TypeScript
代码中本地 JavaScript 对象的 `Map.get/set`，并不是 RPC。Swift 端对应状态使用同步的
UserDefaults 写入，不存在旧端异步存储需要规避的 revision race。

这里的 Complete 表示迁移实现已经具备生产 adapter、UI、持久化和异常路径证据。
正式替换 Expo 版之前仍需完成连接真实桌面 host 的并排验收、真机性能/能耗 profile、
TestFlight 与发布元数据；这些属于 cutover 闸门，不是缺失的功能迁移。

## 验收方法

每个 feature 开始实现前，在 feature 目录维护 `INVARIANTS.md`，逐项记录：

1. 所有入口、sheet、菜单和 deep link。
2. 成功、取消、空态、加载、权限拒绝、协议不兼容和断线状态。
3. 本地持久化 key、Keychain 数据、跨启动恢复和旧 Expo 数据迁移。
4. foreground/background、网络切换、多 host 和跨客户端同步。
5. 与老 Mobile 相同的字号、颜色、间距、图标、loader 和 pressed state。
6. iOS 26 light/dark、键盘、Dynamic Type、VoiceOver、iPhone/iPad 的实机或 Simulator 证据。

完成一项后更新账本的状态与具体 Swift 文件，再运行：

```sh
pnpm check
```

本账本只防止遗漏；最终行为仍须在同一份数据上并排操作 Expo 和 SwiftUI 客户端确认。
