# Codex 限额事件检测研究

状态：Findings / 已删除 Codex 终端文字匹配，并采用 fail-closed rollout 过渡方案<br>
研究日期：2026-08-14<br>
范围：Codex CLI 0.147.0、OpenAI Codex App Server 协议、Codex hooks、Yiru 当前 PTY 集成

## 1. 结论

Codex **有准确的结构化限额失败事件**。App Server 会先为具体 turn 发出 `error`，其
`willRetry` 为 `false`、`error.codexErrorInfo` 为 `"usageLimitExceeded"`，随后同一 turn 的
`turn/completed` 会携带 `status: "failed"` 和同一个错误类型。两个事件都不是从错误文案推断；
`error` 还直接带有 `threadId` 和 `turnId`。[协议中的事件名](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server-protocol/src/protocol/common.rs#L1749-L1774)、
[ErrorNotification schema](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server-protocol/schema/typescript/v2/ErrorNotification.ts#L4-L6)、
[Turn schema](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server-protocol/schema/typescript/v2/Turn.ts#L21-L25)、
[TurnCompletedNotification schema](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server-protocol/schema/typescript/v2/TurnCompletedNotification.ts#L4-L6)。

因此，Yiru 已删除 Codex 的 PTY banner/正则检测。长期协议级替代方案是在执行 agent 的 runtime host 上
托管 App Server，并让 TUI 通过 `codex --remote` 使用该 server；Yiru 从同一 JSON-RPC 事件流读取
结构化事件。若暂时不做这项接入，只能采用第 6.2 节的 fail-closed 结构化过渡；无法满足其约束时应
关闭 Codex 自动限额恢复，而不是保留文字匹配作为兜底。
普通 PTY 包裹的交互 TUI 没有向宿主暴露稳定的结构化事件流；它只输出渲染后的终端字节。
[TUI 的 embedded/remote target](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/tui/src/lib.rs#L239-L272)、
[embedded 与 remote client 的分流](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/tui/src/lib.rs#L459-L490)、
[`--remote` 支持的地址](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/cli/src/main.rs#L910-L921)。

需要明确产品风险：官方当前把 App Server command 和 WebSocket transport 标为 experimental、
不支持 production workloads。结构化事件的语义比文本准确，但接入面仍有版本/稳定性风险；如果
Yiru 不能接受这个风险，当前产品决策就应是关闭 Codex 自动恢复。
[官方 remote TUI 与稳定性说明](https://developers.openai.com/codex/app-server#connect-the-cli-terminal-ui)。

## 2. 三种协议信号不能混为一谈

| 信号 | 粒度与含义 | 是否用作触发器 |
| --- | --- | --- |
| `error` + `usageLimitExceeded` | 指向具体 `threadId`/`turnId` 的即时、不可重试 turn 错误 | **是，主触发器** |
| `turn/completed` + `failed` + 同错误 | 同一 turn 的最终状态，错误只在 failed 时存在 | **是，最终确认/去重** |
| `account/rateLimits/updated` | 稀疏的账户额度快照；额度发生变化时都会发送，本身没有 thread/turn ID | **否，只补充分类和 reset 时间** |

### 2.1 主触发器：`error`

应严格匹配以下字段，不读取 `message`：

```json
{
  "method": "error",
  "params": {
    "willRetry": false,
    "threadId": "...",
    "turnId": "...",
    "error": { "codexErrorInfo": "usageLimitExceeded" }
  }
}
```

源码在处理不可重试错误时先把错误保存到 turn summary，再发送 `will_retry: false` 的
`ErrorNotification`；流式重试错误则单独发送 `will_retry: true`。这让 Yiru 能排除瞬时重试，且不用
猜测终端中的 429、quota 或自然语言。[不可重试错误路径](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server/src/bespoke_event_handling.rs#L1605-L1629)、
[可重试 stream error 路径](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server/src/bespoke_event_handling.rs#L961-L976)。

注意 wire casing：Rust 类型名是 `UsageLimitExceeded`，App Server v2 JSON 值是小驼峰
`"usageLimitExceeded"`。[CodexErrorInfo 生成 schema](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server-protocol/schema/typescript/v2/CodexErrorInfo.ts#L6-L12)。

### 2.2 最终确认：`turn/completed`

不可重试 `error` 被保存后，turn completion 会把该 turn 标记为 `failed` 并附上同一个
`TurnError`；没有错误时才是 `completed`。Yiru 可用 `(threadId, turnId)` 去重：`error` 立即记录
限额命中，`turn/completed` 确认最终失败，不能把同一次失败计为两次。
[turn summary 到最终状态的映射](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server/src/bespoke_event_handling.rs#L1470-L1497)、
[TurnError 字段](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server-protocol/schema/typescript/v2/TurnError.ts#L4-L6)。

### 2.3 元数据：`account/rateLimits/updated`

该通知是“额度变化”而不是“本 turn 已失败”。官方协议明确要求把这个稀疏更新 merge 到最近一次
`account/rateLimits/read`，或者重新读取完整快照；nullable 账户字段缺失不代表清空旧值。
[官方 App Server 文档](https://developers.openai.com/codex/app-server)、
[稀疏更新 schema](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server-protocol/schema/typescript/v2/AccountRateLimitsUpdatedNotification.ts#L6-L13)。

`RateLimitSnapshot` 包含 primary/secondary window、credits、plan type 和
`rateLimitReachedType`；window 的 `resetsAt` 是 Unix 秒。
[RateLimitSnapshot schema](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server-protocol/schema/typescript/v2/RateLimitSnapshot.ts#L4-L14)、
[RateLimitWindow schema](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server-protocol/schema/typescript/v2/RateLimitWindow.ts#L5)。
`rateLimitReachedType` 当前 wire 值为：

- `rate_limit_reached`
- `workspace_owner_credits_depleted`
- `workspace_member_credits_depleted`
- `workspace_owner_usage_limit_reached`
- `workspace_member_usage_limit_reached`

完整枚举来自
[RateLimitReachedType schema](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/app-server-protocol/schema/typescript/v2/RateLimitReachedType.ts#L5)。

## 3. “触发失败”与“安排恢复”必须分开

`usageLimitExceeded` 是可靠的“本 turn 因用量不可继续”分类，但不是可靠的“某个滚动窗口将在固定
时间恢复”分类。Codex 把 `UsageLimitReached`、`QuotaExceeded` 和 `UsageNotIncluded` 都映射成同一个
协议值；只有第一类错误对象明确携带 reset、rate-limit snapshot 和 reached type。
[核心错误映射](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/protocol/src/error.rs#L419-L448)、
[UsageLimitReachedError 字段](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/protocol/src/error.rs#L621-L628)。

正确流程是：

1. 由具体 turn 的 `error` 触发，拒绝任何文字回退。
2. 合并最近的 `account/rateLimits/updated`；缺少元数据时调用 `account/rateLimits/read`。
3. 只有确认存在未来的 reset timestamp、且属于可恢复的窗口耗尽时才安排自动恢复。
4. credits depleted、usage not included 或没有可信 reset 时只显示明确状态，不创建定时恢复。

Codex 收到带快照的 usage-limit 错误时，会先更新 rate-limit snapshot，再向上返回该错误，因此正常
情况下事件流能先提供最新元数据；客户端仍需按稀疏更新规则保留 read fallback。
[先更新 snapshot 的错误路径](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/core/src/session/turn.rs#L1389-L1400)。

## 4. 普通交互 TUI 是否把事件暴露给 Yiru

没有。当前 TUI 默认启动一个 **embedded、in-process** App Server client；只有显式指定
`--remote`，或满足严格条件并发现可复用的本地 daemon 时，才连接外部 endpoint。embedded target
使用进程内 channel，并没有 stdio、WebSocket 或 Unix socket 供 PTY 宿主旁路订阅。
[embedded App Server 启动](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/tui/src/lib.rs#L239-L264)、
[target 选择](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/tui/src/lib.rs#L834-L859)、
[daemon 探测条件](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/tui/src/lib.rs#L966-L984)。

Yiru 当前仍是 plain `codex` + PTY：agent 配置只把 launch command 设为 `codex`
（`packages/shared/src/tui-agent/config.ts:110-117`）。修复前，renderer 会剥离 PTY ANSI 后用正则匹配
`limit reached`、`quota exceeded` 等自然语言，因此 agent 自己讨论类似文字、文案变化或屏幕重绘都可能
制造误报/漏报；cooldown 只能减少重复，不能证明语义。这条文字分类链路现已删除。

仓库已有的隐藏 App Server 也不能直接解决当前 turn 检测：它只为额度刷新临时启动一个独立进程，
初始化后调用 `account/rateLimits/read`，并明确丢弃所有没有 request id 的 server notification。
它既不承载用户正在操作的 TUI thread，也不消费 `error`/`turn/completed`。
`apps/desktop/src/main/rate-limits/codex-fetcher.ts:561-603,664-703`。

## 5. Hooks 不能替代错误事件

Codex 公开 hook 集合没有 `Error`、`TurnFailed` 或 rate-limit hook。官方 hooks 表只列出 turn、session
与工具生命周期事件；当前源码的 `HookEventName` union 也没有错误事件。
[官方 Hooks 文档](https://developers.openai.com/codex/hooks)、
[HookEventName 源码](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/protocol/src/protocol.rs#L1497-L1511)。

`Stop` 也不是失败回调：它只从正常完成的 `!needs_follow_up` 分支运行；普通错误分支发出 error 后
直接 break，绕过 `Stop`。`SessionEnd` 是整个 session 结束事件，不是 turn 失败，官方目前还说明
其 `reason` 始终为 `other`。
[Stop 与 error 控制流](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/core/src/session/turn.rs#L482-L565)、
[SessionEnd 官方语义](https://developers.openai.com/codex/hooks#sessionend)。

Yiru 当前安装的 Codex hooks 也只有 `SessionStart`、prompt、tool、subagent 与 `Stop`
（`apps/desktop/src/main/codex/hook-service.ts:87-101`）。因此继续增加 hook 文字判断不会补上缺失的
错误生命周期事件。

## 6. 可行的 Yiru 架构

### 6.1 协议级方案（实验性）：runtime-hosted App Server + remote TUI

每个实际执行 agent 的 runtime host（local、WSL、SSH 或 relay）负责以下生命周期：

1. 为该 Codex pane 启动一个 App Server endpoint。
2. 用 `codex --remote <endpoint>` 启动仍由用户操作的官方 TUI。
3. 由 Yiru 的 runtime 侧 JSON-RPC bridge 转发 TUI 与 App Server 消息，并只读复制 server
   notifications；审批和用户输入仍原样由 TUI 完成。
4. bridge 严格按 `(threadId, turnId)` 处理 `error` 与 `turn/completed`，把规范化限额事件发布到现有
   runtime/shell transport。
5. 同一 runtime 上维护 account snapshot；收到 typed failure 后按第 3 节规则决定是否安排恢复。

`codex app-server` 支持 stdio、Unix socket 和 WebSocket transport，TUI 的 `--remote` 支持
`ws://`、`wss://` 与 `unix://`；因此 bridge 可以留在执行主机，不需要把 SSH/WSL 的 socket 路径或
认证信息暴露给 renderer。[App Server 官方文档](https://developers.openai.com/codex/app-server)、
[`--remote` CLI 定义](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/cli/src/main.rs#L910-L921)。
官方目前明确把 App Server command 和 WebSocket transport 标为 experimental、unsupported for
production；该方案必须用 CLI/version capability gate，不能被当作永久稳定 API。
[官方 transport 状态](https://developers.openai.com/codex/app-server#protocol)。

这个方案最终应取代当前 rollout adapter，不应与旧正则双写。若新 endpoint 启动、
协议初始化或 schema narrowing 失败，则“Codex 自动恢复不可用”是安全降级；回退到终端文字会重新
引入同一类误报。

### 6.2 可选过渡：读取 rollout JSONL，但只能 fail closed

普通 TUI 会把 terminal error 和最终 `task_complete` 写入 rollout；最终记录含结构化
`error.codex_error_info`，v1 rollout wire 使用 snake case `"usage_limit_exceeded"`。这是比终端
文字更准确的本地信号。[event 持久化路径](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/core/src/session/mod.rs#L1881-L1906)、
[rollout item 写入](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/core/src/session/mod.rs#L2099-L2126)、
[TurnComplete error 字段](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/protocol/src/protocol.rs#L1995-L2002)、
[`task_complete` wire 名](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/protocol/src/protocol.rs#L1335-L1338)、
[v1 CodexErrorInfo 的 snake-case 序列化](https://github.com/openai/codex/blob/8630bb3caecaff6abc6add450a88035d9f6d3f8c/codex-rs/protocol/src/protocol.rs#L1763-L1771)。

Yiru 已从 Codex hook 保存权威 `transcript_path`
（`packages/workbench-model/src/agent-session-resume.ts:20-31,173-185`），也已有增量 JSONL tail engine
（`apps/desktop/src/main/native-chat/transcript-watch-engine.ts:1-14,60-79,130-143`），所以可以较小成本
添加一个只识别完整 JSON record 的过渡 adapter。当前实现位于
`apps/desktop/src/main/rate-limit-resume/codex-rollout.ts`：renderer 只把 PTY 活动当作检查时机，runtime
按 hook 的 `session_id`、`transcript_path` 和 `turn_id` 精确读取对应 completion；未知结构直接返回无命中。

但这不是稳定的公开接口。OpenAI 明确写明 hook 提供的 `transcript_path` 只为方便，transcript
格式可能变化。[Hooks 文档的稳定性声明](https://developers.openai.com/codex/hooks#common-input-fields)。
若采用此过渡方案，必须按已知 schema 做严格 narrowing、对未知记录/版本关闭检测，并且绝不能
回退到文字匹配。它不应替代 6.1 的 App Server 事件接入。

## 7. 决策建议

1. **已删除 Codex PTY banner matching。** 它不是 Codex 的协议能力，且已经有准确事件。
2. **保留“限额后恢复”产品能力，但把 Codex provider 改为 typed-event-only。** 协议实现采用
   runtime-hosted App Server + `--remote`，并把官方的 experimental 状态纳入 capability gate。
3. **本次未接入实验性的 remote App Server，采用 fail-closed rollout tail 过渡。** 该实现只认已知
   的结构化 completion，不把用户可见文字继续当协议；格式变化时会关闭检测而不是猜测。
4. **账户更新只用于解释和调度。** `account/rateLimits/updated` 不能代替 per-turn error，缺字段时
   调 `account/rateLimits/read`。

本研究同时用已安装的 Codex CLI 0.147.0 生成 experimental JSON schema，核对了 wire casing 和
字段；结论与上述固定到 OpenAI `openai/codex` commit
`8630bb3caecaff6abc6add450a88035d9f6d3f8c` 的生成 schema 一致。
