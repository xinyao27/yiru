# Native iOS visual parity

`apps/mobile` 是页面结构、信息密度、字号、间距、icon、Loader 和状态语义的基准。
SwiftUI 页面只在 navigation、toolbar、sheet、menu、keyboard 和 Liquid Glass 控件表面采用
iOS 26 原生表达。Fixture 必须组合生产 View、Model 和 protocol adapter，不能复制一份仅供截图的
页面。

## 2026-08-14 simulator audit

本轮在 iPhone 17 Pro、iOS 26.5 上将旧 Expo UI Lab 与原生页面逐屏并排核对，并在浅色模式
跑完全部确定性入口，在深色模式复核 Workspace List、Native Chat、Source Review、Appearance
和 Design System。以下入口同时可以从 DEBUG `UI Lab` 打开。

| 页面域 | 原生启动参数 | 本轮覆盖 |
| --- | --- | --- |
| Home | `--home-fixture`、`--home-onboarding-fixture` | dashboard、usage、connected/offline host、onboarding、主 CTA |
| Pairing | `--pairing-scan-fixture`、`--pairing-confirm-fixture` | 空摄像头 fallback、paste、确认、connecting |
| Activity 与通知 | `--activity-fixture`、`--notification-opt-in-fixture` | activity/tokens/value、range、图表、一次性权限引导 |
| Workspace | `--workspace-list-fixture`、`--workspace-create-fixture`、`--workspace-actions-fixture` | pinned/project/lineage、创建表单、setup trust、生命周期操作 |
| Accounts 与 History | `--accounts-fixture`、`--agent-history-fixture` | provider usage、managed accounts、filter/search/resume |
| Files | `--files-fixture`、`--file-preview-fixture` | tree 展开、不可用文件、图片、源码、line focus |
| Source Control | `--source-control-fixture`、`--commit-history-fixture`、`--source-review-fixture`、`--hosted-review-fixture` | stage/unstage/discard/commit、history 展开、diff filter/note、PR 状态与操作 |
| Session | `--terminal-chrome-fixture`、`--terminal-actions-fixture`、`--session-content-fixture`、`--browser-fixture` | tab、SwiftTerm、accessory、action sheets、Markdown/file/diff、remote browser |
| Native Chat | `--chat-fixture`、`--chat-working-fixture`、`--chat-permission-fixture`、`--chat-empty-fixture`、`--chat-error-fixture` | transcript、完整 Markdown、tool detail、send、working/stop、permission、空态、失败 |
| Settings | `--settings-fixture`、`--appearance-fixture`、`--chat-settings-fixture`、`--terminal-settings-fixture`、`--browser-settings-fixture`、`--notification-settings-fixture`、`--troubleshooting-fixture`、`--connection-log-fixture`、`--about-fixture` | 所有旧设置 route 与 diagnostics |
| Design System | `--design-system-fixture` | 三种按钮 context、10/16/18/20pt Loader、颜色与 surface 合同 |

## 本轮修复

- Native Chat 不再把 Markdown 压成一个 `Text`；标题、段落、列表、任务、表格、代码高亮、
  行内/块级数学、中文和 emoji 由共享 structured renderer 保持旧版结构，正文恢复为 17pt。
- 独立 File Preview 不再把源码压成逐字换行的窄列；横向内容保持固有宽度，line focus 只把
  目标行垂直居中，并保留 leading anchor。
- 旧 Expo route 对应的 Settings、Activity、Diagnostics、Terminal Settings、Hosts 和 Pairing
  页面显式使用 inline navigation title，避免 SwiftUI 默认大标题改变首屏密度。
- Hosts 的长连接状态不再在窄屏被截断或强制换行；icon、文字和语义色拥有固定状态列。
- Pairing 的可用摄像头状态恢复旧版 1 / 2 / 3 步骤、圆角取景器、四角 reticle 和底部常规
  paste 操作；首次权限不再自动弹窗，而是先显示 Continue / Paste code instead。无摄像头状态
  只保留一个 paste 入口。
- 扫描或粘贴有效 code 后在扫描页直接进入 Connecting、Pairing log 和失败重试，不再多跳一次
  Confirm；只有外部 pairing deep link 保留确认页。全屏确认恢复 44pt、全宽、上下排列的主次按钮。
- Commit History fixture 使用真实 commit/file 结构，已实际展开文件列表；不再用空数据掩盖页面。
- 四个 WidgetKit gallery 页面使用真实 App Group 数据完成浅色核对，Token Widget 另外完成深色
  核对；Weekly 缺失值、10/11/12pt icon、Total 标签字重与 Token 深色背景恢复旧版语义和尺寸。
- 全部系统 `ProgressView` 和迁移 Loader 使用 `mutedForeground`；业务按钮没有蓝色默认 tint。

## 2026-08-15 regression pass

- 独立的 Hosts 列表页（`--hosts-fixture`、`HostListView`）已于 2026-08-20 删除：它没有任何
  导航入口，而主机的选择、编辑和配对都从 Home 进入。这条记录保留是因为当时的核对确实做过，
  但对应的屏幕已不存在。
- Hosts fixture 关闭后恢复真实开发 Desktop，`build_run_sim` 重新编译并启动 native app；Home
  重新加载 101 个 Workspace、1 个 Working 和 1 个 Recent，确认本轮视觉审计没有破坏 live
  runtime 连接。

## 2026-08-16 live phone chrome pass

- The live iPhone 17 Pro session route was compared with the Expo compact Session header. Native now
  uses a compact-width two-line title with the tab-count subtitle and a Hugeicons back action instead
  of the default system navigation glyph. The live Host 3 workspace exposed the expected
  `xinyao27/web-daemon-architecture-gap` title, `3 tabs` summary, tab strip, terminal accessory, and
  session actions after the change. Regular-width layouts retain the standard native navigation title;
  this is a phone-layout correction, not a second desktop header.
- Activity insights was reopened against the same live Desktop and compared with Expo's full-screen
  modal chrome. The leading action is now a neutral Hugeicons X with an explicit Close label; the
  live pass switched 7 → 30 days, selected Tokens, and returned Home without a route crash. Provider
  failure and stale-cache variants still require the broader behavior matrix.
- The regular-width Workspace List was checked live on an iPad Pro 11-inch (M5), iOS 26.5. Its
  split sidebar kept the old row density and toolbar actions, the More menu rendered `Hide sidebar`,
  and hiding the column left the detail surface usable with a `Show Sidebar` affordance. Compact
  iPhone navigation is unchanged by this split-only behavior.

On 2026-08-16, a clean iPad Pro 11-inch (M5) auto-pair launch was repeated after rebooting the
simulator. Live Home loaded the development Desktop counts and provider cards without a system URL
confirmation overlay. The physical 1668 x 2420 layout was also opened through the production-backed
Workspace List and Terminal fixtures: the wide header, two-column Home cards, full-width terminal
surface, tab strip, and accessory controls stayed within the iPad geometry. Live iPad route-state
and mutation coverage remains separate from this visual-width pass.

## 仍需真机或真实 host 的 cutover gate

Simulator 可以验证页面、状态、布局和 protocol wiring，但以下项目不能用 fixture 宣称通过：

- 真机摄像头 QR 扫描、系统通知授权与 push 到达；
- 真实 desktop host 的配对、断线、重连、后台恢复、relay/SSH/WSL 路径；
- SwiftTerm 的 IME、硬件键盘、VoiceOver、30 分钟输出洪峰和内存曲线；
- WidgetKit 在真机跨后台、重启和系统调度下的 timeline 刷新、真机能耗、TestFlight 签名与发布元数据。

这些是发布替换旧 Expo App 前的环境验收，不是创建另一套页面 fixture 的理由。功能实现证据和
route/capability 完整性继续由 [`FUNCTIONAL-PARITY.md`](./FUNCTIONAL-PARITY.md) 与
[`migration-parity.json`](./migration-parity.json) 维护。
