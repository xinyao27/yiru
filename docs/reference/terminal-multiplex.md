# Terminal multiplex 协议规格

状态：Implemented，现行参考<br>
目标 capability：terminal.multiplex<br>
适用客户端：Electron desktop、web、mobile，以及经 relay 接入的客户端<br>
协议所有者：runtime host 的 terminal transport 模块

## 1. 摘要

Terminal multiplex 在一条按 environment 独占的 WebSocket bulk 连接上复用多个 PTY stream。普通 oRPC 连接继续承载生命周期、查询和其他控制调用；bulk 连接只承载一个长寿命 terminal.multiplex 调用及其二进制 side channel。关键决定如下：

- 只定义 WebSocket lane；main/host headless xterm 始终摄取输出并权威拥有 buffer/快照/恢复。
- 每 client/environment 至多一条独占 bulk；client 分配的 streamId 在 epoch 内不复用。
- sequence、credit、ACK、水位统一使用 UTF-8 byte；累计 Output ACK 只由 xterm parse 回调推进。
- 接收窗口根据 end-to-end parse ACK 的 RTT 和 delivery rate 自适应，且有严格的 per-stream 和 per-connection 上下界。
- 每次 bulk 重连产生新 epoch。断线、sequence gap、iOS 后台恢复和 relay-moved 都走同一个 authoritative snapshot 恢复状态机。
- hidden 停止 view delivery 但 model 继续摄取，reveal 走双屏分块权威快照；严格 127.0.0.1/token/Origin 的 loopback 可免 E2EE，其他 lane 用 wss+AEAD，relay 只转 opaque bytes。
- client/server 只实现本协议；不保留旧 decoder、adapter、capability 或运行时 fallback。

本规格使用 MUST、MUST NOT、SHOULD、MAY 表示强制、禁止、建议和可选要求。

## 2. 范围与非目标

范围包括 bulk admission/framing、多 stream 生命周期、output/input 流控与确认、epoch/gap 恢复、hidden/reveal、双屏快照、side effects、所有 PTY 控制、安全约束和单版本发布闸门。

- 不改变 PTY/provider/headless 权威模型，也不规定 UI、字体、主题或 xterm addon。
- 不替代普通 oRPC 控制面；无限速 producer 只保证有界内存、明确恢复和最终 model 一致。
- relay 不得解密、解释、压缩或按内容重排；不提供旧 wire 兼容、双栈或 fallback。

## 3. 设计不变量

1. gate 前 host 先按原序写 headless；outputSeq 是 generation 内已接收 UTF-8 byte 的 end-exclusive 累计位置。
2. coverageEndSeq 表示 snapshot 已反映 `[0, coverageEndSeq)`；stream 状态只可为 live、gated、snapshotting、recovering、closed。
3. advertise 前移除旧 delivery owner，每 generation 只有一个 owner；control 不得越过同 stream 更早的 model-changing 操作。

renderer 只依赖一个 TerminalTransport interface，暴露 `attach`、`detach`、`sendInput`、
`resize`、`claimViewport`、`signal`、`kill`、`setDeliveryState`、`requestSnapshot`。loopback、LAN、
Tailscale、relay、cellular 差异隐藏在 adapter 内；调用方不感知 AEAD、WebSocket queue、outer
envelope 或 epoch。Why：统一的深 interface 防止 ACK、快照和 gate 语义再次扩散到 terminal pane。

## 4. 连接拓扑与 admission

### 4.1 两类连接

每个 environment 对一个已认证 client session 有两类 WebSocket：

| 连接 | 数量 | 职责 |
| --- | ---: | --- |
| control | 一个或连接池 | 普通短 oRPC、terminal 生命周期、capability、设备与 workspace 控制 |
| terminal bulk | 最多一个活动 epoch | terminal.multiplex iterator、binary frames、心跳和 stream 控制 |

terminal bulk 连接建立后，首个成功调用 MUST 是 terminal.multiplex。连接一旦被标记为 bulk，任何其他 oRPC method MUST 以 connection_use_conflict 拒绝并关闭连接；先调用普通 method 的连接也 MUST 拒绝 terminal.multiplex。该规则保留现有 admission 不变量。Why：独占 socket 避免 bulk flood 对控制面造成 head-of-line blocking，并允许独立的内存、优先级与断线策略。

### 4.2 唯一性

服务端以以下三元组识别一个 bulk owner：

    principalId × clientInstanceId × environmentId

同一三元组只能有一个活动 epoch。新连接通过认证并完成 Epoch 握手后，服务端 MUST 以 close code 4001 和 reason superseded 关闭旧连接。不同设备或不同 clientInstanceId 可以各有自己的 bulk 连接。

### 4.3 建连顺序

1. 客户端在 control 连接调用 status.get。
2. 只有 capability 列表包含 terminal.multiplex 才可建 bulk 连接。
3. 客户端在 control 连接调用 terminal.openMultiplex，提交 environmentId 和 clientInstanceId。
4. 服务端返回短期 bulkTicket、bulkEndpoint、expiresAt 和 maxFrameBytes。
5. 客户端建立 bulk WebSocket，完成 lane 对应的认证与加密握手。
6. 客户端在该 socket 上发起唯一的 terminal.multiplex oRPC iterator。
7. 服务端发送 Epoch；客户端回送 Epoch accept。
8. 双方完成初始 Heartbeat 后，客户端才可发 Subscribe。bulkTicket MUST：

- 至少有 256 bit 随机熵；
- 绑定 principalId、clientInstanceId 和 environmentId；
- 最长 30 秒有效；
- 单次兑换；
- 不出现在 URL query、日志、错误文本或遥测字段中。

## 5. 基本 wire 类型

所有固定宽度整数均为 unsigned little-endian。解析器不得使用平台原生字节序。

| 名称 | 宽度 | 语义 |
| --- | ---: | --- |
| u8 | 1 B | 0 到 255 |
| u16 | 2 B | 0 到 65,535 |
| u32 | 4 B | 0 到 4,294,967,295 |
| i32 | 4 B | −2,147,483,648 到 2,147,483,647 |
| u64 | 8 B | 0 到 2^64−1 |
| bool8 | 1 B | 只能为 0 或 1 |
| uuid128 | 16 B | RFC 4122 network byte order |
| utf8 | 可变 | 严格 UTF-8；无 BOM；长度由 frame 或显式 u32 给出 |
| bytes | 可变 | 不解释的 byte 序列 |

JavaScript 实现 MUST 用 bigint 或 high/low u32 pair 表示 u64。不得把 wire u64 转为 number 后再比较，因为 number 不能精确表示完整的 u64。UTF-8 decoder 遇到非法序列 MUST 把当前 stream 置为 protocol-error，不得用 replacement character 继续并推进 ACK。

## 6. Outer oRPC side-channel envelope

每个 terminal inner frame 是长寿命 terminal.multiplex oRPC 调用的 binary side-channel payload。outer envelope 沿用 packages/runtime-protocol/src/runtime-orpc-peer-frame.ts：

| Offset | 字段 | 类型 | 要求 |
| ---: | --- | --- | --- |
| 0 | kind | u8 | 0x79 |
| 1 | version | u8 | 1 |
| 2 | requestIdLength | u16 | little-endian，必须非零 |
| 4 | requestId | utf8 | 当前 UUID 为 36 B |
| 4 + N | terminalFrame | bytes | 本规格第 7 节 |

当前 UUID requestId 下 outer envelope 恰为 40 B。一个 bulk epoch 的所有 terminal frame MUST 使用同一个 requestId；requestId 只把 binary frame 路由到 terminal.multiplex 调用，不能代替 inner routeId、epoch 或 correlationId。Why：保留 outer envelope 能复用 oRPC invocation 生命周期和取消机制。inner header 仍需要 routeId，因为一个 invocation 内有多个 PTY；仍需要 epoch，因为 requestId 不表达重连代际。

## 7. Terminal inner frame

### 7.1 固定 40 B header

| Offset | 字段 | 类型 | 值或语义 |
| ---: | --- | --- | --- |
| 0 | kind | u8 | 0x74 |
| 1 | version | u8 | 1 |
| 2 | opcode | u8 | 第 8 节 |
| 3 | flags | u8 | 必须为 0 |
| 4 | headerBytes | u16 | 必须为 40 |
| 6 | reserved0 | u16 | 必须为 0 |
| 8 | routeId | u32 | 0 为 connection control；其他值为 streamId |
| 12 | payloadBytes | u32 | 紧随 header 的 payload 长度 |
| 16 | epoch | u64 | 当前 bulk connection epoch |
| 24 | seq | u64 | opcode 指定的累计序列；无语义时为 0 |
| 32 | correlationId | u32 | 请求/回复关联；不需要时为 0 |
| 36 | reserved1 | u32 | 必须为 0 |

payload 紧随 header，无对齐 padding。一条 inner frame MUST 完整占据一个 outer side-channel payload；不得在一个 WebSocket message 内拼接多个 inner frame，也不得把一个 inner frame 拆成多个 WebSocket message。

40 B header 按 8 B 对齐，允许 DataView 或原生语言安全读取 u64，同时给未来 header 版本保留清晰的 headerBytes 扩展点。

### 7.2 长度和大小限制

- 实际 inner frame byteLength MUST 等于 40 + payloadBytes。
- 普通 frame 的 payloadBytes MUST 小于等于协商的 maxFrameBytes，默认 65,536。
- SnapshotChunk 的 payload data 部分默认最多 49,152 B，使加密和 outer framing 后仍远低于常见 WebSocket message cap。
- 单 frame 硬上限为 1 MiB；SnapshotStart 声明的整组上限另见第 14 节。
- 长度不符、保留位非零、routeId 非法或 epoch 不匹配均不得进入 opcode handler。

### 7.3 错误处理

| 错误 | 动作 |
| --- | --- |
| 未知 kind/version/headerBytes | WebSocket close 1002 |
| 长度不符或超过硬上限 | WebSocket close 1009 |
| epoch 旧于当前值 | 静默丢弃并计 stale_epoch_frame |
| epoch 未知或未来值 | WebSocket close 1002 |
| routeId 不存在 | 发送 Error unknown_stream；不关闭其他 stream |
| 未知 opcode | 发送 Error unsupported_opcode 后关闭该 stream |
| payload schema 错误 | 发送 Error invalid_payload 后关闭该 stream |

## 8. Opcode 表

方向中的 C 表示 client，S 表示 server。除 Epoch 和 Heartbeat 外，routeId 必须非零。

| Opcode | 名称 | 方向 | seq | correlationId | Payload |
| ---: | --- | --- | --- | --- | --- |
| 0x01 | Epoch | C↔S | 0 | 0 | EpochRecord |
| 0x02 | Heartbeat | C↔S | 0 | pingId | HeartbeatRecord |
| 0x10 | Subscribe | C→S | lastParsedSeq | requestId | SubscribeRecord |
| 0x11 | Subscribed | S→C | currentOutputSeq | requestId | SubscribedRecord |
| 0x12 | Unsubscribe | C→S | lastParsedSeq | requestId | Empty |
| 0x13 | End | S→C | finalOutputSeq | 0 | EndRecord |
| 0x14 | Error | C↔S | relatedSeq 或 0 | related request | ErrorRecord |
| 0x15 | Output | S→C | end-exclusive outputSeq | 0 | raw UTF-8 |
| 0x16 | Ack | C↔S | cumulative acknowledged seq | requestId 或 0 | AckRecord |
| 0x17 | Credit | C↔S | 0 | 0 | CreditRecord |
| 0x18 | Input | C→S | end-exclusive inputSeq | inputId | InputRecord |
| 0x19 | Resize | C→S | 0 | requestId | ViewportRecord |
| 0x1a | Resized | S→C | model outputSeq | requestId 或 0 | ResizedRecord |
| 0x1b | ClaimViewport | C→S | 0 | requestId | ClaimRecord |
| 0x1c | SnapshotRequest | C→S | lastParsedSeq | requestId | SnapshotRequestRecord |
| 0x1d | SnapshotStart | S→C | coverageEndSeq | snapshotId | SnapshotStartRecord |
| 0x1e | SnapshotChunk | S→C | coverageEndSeq | snapshotId | SnapshotChunkRecord |
| 0x1f | SnapshotEnd | S→C | coverageEndSeq | snapshotId | SnapshotEndRecord |
| 0x20 | VisibilityGate | C→S | lastParsedSeq | stateVersion | VisibilityRecord |
| 0x21 | RevealSnapshot | C→S | lastParsedSeq | requestId | RevealRecord |
| 0x22 | SideEffectBatch | S→C | observedThroughSeq | 0 | SideEffectRecord |
| 0x23 | ClearBuffer | C↔S | appliedThroughSeq | requestId | ClearBufferRecord |
| 0x24 | ModelRestore | S→C | requiredThroughSeq | 0 | ModelRestoreRecord |
| 0x25 | Signal | C→S | 0 | requestId | SignalRecord |
| 0x26 | Kill | C→S | 0 | requestId | KillRecord |
| 0x27 | Metadata | S→C | observedThroughSeq | 0 | MetadataRecord |
| 0x28 | FitOverride | S→C | model outputSeq | 0 | FitOverrideRecord |
| 0x29 | Driver | S→C | model outputSeq | 0 | DriverRecord |

Empty payload 的 payloadBytes 必须为 0。

## 9. Payload 编码

### 9.1 编码类别

hot path 使用固定 binary record：

- Epoch
- Heartbeat
- Ack
- Credit
- SnapshotStart
- SnapshotChunk
- SnapshotEnd
- VisibilityGate
- Input
- Kill

低频、字段较多且已有 JSON contract 的 record 使用严格 UTF-8 JSON：

- Subscribe / Subscribed
- Error / End
- Resize / Resized / ClaimViewport
- SnapshotRequest / RevealSnapshot
- SideEffectBatch
- ClearBuffer / ModelRestore
- Signal / Metadata / FitOverride / Driver

JSON payload MUST 是 object，不得有重复 key、NaN、Infinity 或超出安全整数范围的 number；u64 用十进制 string。未知字段可忽略，未知枚举值不可忽略。Why：hot path 避免 JSON allocation；低频控制沿用既有 JSON，避免新增 codec 依赖。

### 9.2 EpochRecord，24 B

| Offset | 字段 | 类型 | 语义 |
| ---: | --- | --- | --- |
| 0 | phase | u8 | 0 offer，1 accept |
| 1 | protocolMinor | u8 | 初始为 0 |
| 2 | flags | u16 | 必须为 0 |
| 4 | maxFrameBytes | u32 | 协商后的 payload 上限 |
| 8 | maxStreams | u32 | 当前连接 stream 上限 |
| 12 | heartbeatMs | u32 | 默认 15,000 |
| 16 | connectionGeneration | u32 | control transport 的 generation |
| 20 | reserved | u32 | 0 |

header 的 epoch 由 server 用 CSPRNG 生成非零 u64。offer 和 accept 必须使用同一 epoch。客户端收到 offer 前不得接受其他 opcode。

### 9.3 HeartbeatRecord，16 B

| Offset | 字段 | 类型 | 语义 |
| ---: | --- | --- | --- |
| 0 | phase | u8 | 0 ping，1 pong |
| 1 | appState | u8 | 0 foreground，1 background，2 unknown |
| 2 | reserved | u16 | 0 |
| 4 | senderQueueBytes | u32 | socket queue 的近似 byte 数 |
| 8 | monotonicMicros | u64 | sender monotonic timestamp |

pong 复用 ping 的 correlationId，并回显 ping 的 monotonicMicros。双方每 15 秒在无业务流量时发送 ping；30 秒未观察到 pong 或任何已认证 frame 时终止 socket。RFC 6455 ping/pong MAY 同时使用，但不能代替本 opcode，因为应用层需要 epoch 和 queue telemetry。

### 9.4 AckRecord，24 B

| Offset | 字段 | 类型 | 语义 |
| ---: | --- | --- | --- |
| 0 | kind | u8 | 0 output，1 input，2 snapshot，3 control |
| 1 | status | u8 | 0 accepted，1 rejected，2 busy，3 superseded |
| 2 | errorCode | u16 | 第 23 节；成功为 0 |
| 4 | acknowledgedBytes | u32 | 本次新确认 byte，仅用于诊断 |
| 8 | cumulativeSeq | u64 | 必须等于 header.seq |
| 16 | receiverQueueBytes | u32 | parse/write queue 的近似 byte |
| 20 | reserved | u32 | 0 |

Output ACK 的 correlationId 必须为 0。Input、snapshot 和 control ACK 必须回显请求的 correlationId。acknowledgedBytes 不参与正确性计算；sender 只按 cumulativeSeq 做 max-merge。

### 9.5 CreditRecord，16 B

| Offset | 字段 | 类型 | 语义 |
| ---: | --- | --- | --- |
| 0 | direction | u8 | 0 server-output，1 client-input |
| 1 | reason | u8 | 0 initial，1 adaptive，2 gated，3 pressure |
| 2 | reserved | u16 | 0 |
| 4 | maxInFlightBytes | u32 | 绝对窗口，不是增量 |
| 8 | ackEveryBytes | u32 | ACK byte threshold |
| 12 | maxFrameBytes | u32 | 该 stream 当前帧 payload cap |

maxInFlightBytes 可降到 0。sender 已经发出的 byte 不会因此变成违规；它 MUST 停止新发送，直到 inFlight 小于新窗口。

### 9.6 VisibilityRecord，8 B

| Offset | 字段 | 类型 | 语义 |
| ---: | --- | --- | --- |
| 0 | visible | bool8 | view 是否可见 |
| 1 | deliveryInterest | bool8 | 是否有 raw-byte sidecar/eager consumer |
| 2 | priority | u8 | 0 parked，1 visible，2 active |
| 3 | reserved | u8 | 0 |
| 4 | stateVersion | u32 | 必须等于 correlationId |

### 9.7 KillRecord，8 B

| Offset | 字段 | 类型 | 语义 |
| ---: | --- | --- | --- |
| 0 | keepHistory | bool8 | 是否保留历史 |
| 1 | immediate | bool8 | 必须为 1 |
| 2 | reserved0 | u16 | 0 |
| 4 | reserved1 | u32 | 0 |

服务端必须以 Subscribe 时绑定的完整 transportGeneration 校验 Kill；wire 上不传截断 generation。

### 9.8 InputRecord

Input payload 至少 8 B：

| Offset | 字段 | 类型 | 语义 |
| ---: | --- | --- | --- |
| 0 | kind | u8 | 0 ordinary，1 query-reply |
| 1 | flags | u8 | 必须为 0 |
| 2 | reserved | u16 | 0 |
| 4 | dataBytes | u32 | payload 剩余长度 |
| 8 | data | bytes | 严格 UTF-8 input |

## 10. 多路复用与 streamId

### 10.1 分配

- routeId 0 永远保留给 connection control。
- 客户端从 1 开始单调分配 streamId，最大为 0x7fffffff。
- streamId 在同一 epoch 内关闭后也不得复用。
- 计数耗尽时客户端必须建立新 epoch，不能 wrap。
- 服务端用 epoch + streamId 作为二进制 handler key。

Why：旧实现 wrap 后查空 slot，会把迟到 frame 错路由到新 stream；新 epoch 换取可证明的 identity。

### 10.2 SubscribeRecord

Subscribe JSON schema：

    {
      "terminal": string,
      "transportGeneration": UUID string,
      "client": {
        "id": string,
        "type": "desktop" | "mobile" | "web"
      },
      "viewport"?: { "cols": u16, "rows": u16 },
      "lastParsedSeq": decimal-u64-string,
      "delivery": {
        "visible": boolean,
        "interested": boolean,
        "priority": "parked" | "visible" | "active"
      },
      "snapshotMaxBytes": u32,
      "capabilities": {
        "dualScreenSnapshot": 1,
        "parseAck": 1,
        "explicitWriteAck": 1
      }
    }

服务端必须验证 terminal handle 当前仍指向 transportGeneration 对应的 PTY。stale handle 返回 terminal_handle_stale，缺少 PTY 返回 no_connected_pty。验证期间同 streamId 的重复 Subscribe 以最新请求为准，但旧注册必须先 release-balanced 地清理。

### 10.3 SubscribedRecord

Subscribed JSON schema：

    {
      "terminal": string,
      "transportGeneration": UUID string,
      "ptyState": "running" | "exited",
      "cols": u16,
      "rows": u16,
      "displayMode": "auto" | "desktop",
      "driver":
        { "kind": "idle" | "desktop" } |
        { "kind": "mobile", "clientId": string },
      "initialState": "snapshot" | "resume" | "empty",
      "snapshotId"?: u32,
      "truncated": boolean
    }

Subscribed 只表示 slot 已验证并注册，不表示 renderer 已有可显示状态。initialState 为 snapshot 时，stream 必须保持 snapshotting，直到第 14 节的 snapshot ACK 完成。

### 10.4 Unsubscribe 与 End

Unsubscribe 收到后服务端：

1. 停止该 stream 的新 frame。
2. release viewport claim、delivery subscriber、data/resize/side-effect listener。
3. 清理 unsent 和 in-flight accounting。
4. 回 Ack(kind=control, accepted)。
5. 删除 stream。PTY 自然退出时服务端先发送所有已经进入发送窗口的 Output，再发送 End。End JSON：

    {
      "exitCode": i32 | null,
      "reason": "exit" | "killed" | "gone" | "transport-replaced",
      "historyKept": boolean
    }

客户端只有在 Output parse ACK 已推进到 End.header.seq 后才可向 UI 发布 exit，保证末尾输出先于 exit 可见。

## 11. Sequence 定义与迁移

### 11.1 Output sequence

每个 PTY transport generation 有独立的 outputSeq，初值为 0。host 每收到一个 PTY string：

1. 严格 UTF-8 编码为 sourceBytes。
2. 把 sourceBytes 写入权威 model。
3. 将 outputSeq 增加 sourceBytes.byteLength。
4. delivery frame 可重新聚合或切分，但不得改变 byte 顺序。Output frame 的：

    frameStartSeq = header.seq - payloadBytes
    frameEndSeq   = header.seq

客户端期望 frameStartSeq 等于 expectedSeq。小于 expectedSeq 是重复或 snapshot overlap；大于 expectedSeq 是 gap。Output frame MUST 在 UTF-8 code point 边界切分。客户端仍 MUST 使用 streaming TextDecoder，以承受未来 producer adapter 提供的任意合法切分。

### 11.2 sequence cutover

现有本地 seq/ACK 使用 UTF-16 code unit，远端 credit 使用 UTF-8 byte。本协议不换算旧累计值：

- 为权威 PTY generation 新增独立 wireByteSeq；
- 新 adapter 只读取 wireByteSeq；
- 禁止根据累计 charSeq 乘估算系数生成 byteSeq。
- 升级切换每个 live PTY 的 delivery owner 时只生成一次新 transportGeneration，并以 snapshot 建立 byteSeq 基线；
- advertise terminal.multiplex 前删除旧 charSeq delivery/ACK 路径。

Why：一个 surrogate pair 是 2 个 UTF-16 code unit、4 个 UTF-8 byte，ASCII 又是 1:1。累计值不存在无损比例换算；猜测换算会制造假 gap 或吞掉真实 gap。

### 11.3 inputSeq

inputSeq 是客户端在当前 epoch、当前 stream 上提交的 UTF-8 input byte 累计位置。服务端只在：

- viewport/input floor 允许；
- transportGeneration 仍匹配；
- provider write queue 接受完整 payload；

之后回 Ack(kind=input, accepted)。accepted 表示 byte 已交给 host/provider write queue，不表示 shell 已读取或执行。被拒绝的 Input 不推进服务端 accepted inputSeq。客户端收到 rejected ACK 后不得自动重发，除非上层操作明确是幂等的 query reply。

## 12. Output 流控

### 12.1 基本公式

每个 stream 维护：

    inFlightBytes = sentEndSeq - cumulativeAckSeq

只有满足以下两项时可发送 Output：

    inFlightBytes + nextPayloadBytes <= streamCreditBytes
    connectionInFlightBytes + nextPayloadBytes <= connectionCreditBytes

Credit 是接收方发布的绝对窗口。ACK 是消费进度。两者不可合并：

- ACK 丢失可由后续累计 ACK 自愈；
- Credit 变化不伪造消费进度；
- hidden gate 可把 Credit 降为 0，而不承认尚未 parse 的 byte。

### 12.2 parse-complete ACK

客户端收到 Output 后不得立即 ACK。准确顺序为：

1. 校验 epoch、streamId 和 sequence。
2. 把 payload 加入该 terminal 的有序 xterm write scheduler。
3. xterm write callback 表示该 payload 已 parse。
4. 更新 parsedSeq。
5. 生成累计 Ack(kind=output, cumulativeSeq=parsedSeq)。被 UI policy 丢弃但不需要 xterm parse 的 frame，只有在 policy 已明确消费其语义后才可 ACK。snapshotting/recovering 时暂存的 frame 不得提前 ACK。ACK 可以合并，但触发点必须是 parse completion。发送条件为以下任一先发生：

- 新 parse byte 达到 Credit.ackEveryBytes；
- 自首个未发送 parse completion 起经过 max(250 μs, min(4 ms, srtt / 4))；
- snapshot、End 或需要有序确认的 control barrier 已 parse。

默认 ackEveryBytes 为 clamp(16 KiB, window / 8, 256 KiB)。

### 12.3 聚合

- producer 原始 chunk 可在最多 2 ms 内聚合。
- 交互输出在最近 100 ms 有输入时 MAY 立即 flush。
- Output 目标 payload 为 32 KiB。
- 合法范围为 16–64 KiB。
- 单次 scheduler turn SHOULD 最多发 2 个 Output，然后 yield。

Why：实测 PTY 最高 119.57 MiB/s、原始 chunk 约 1 KiB；8 KiB 以上聚合显著减少 event-loop 饥饿。现有本地 2 ms、16 Ki chars、每轮 2 次写是有效基线；本协议把单位改为 byte，并把远程现有 48 KiB chunk 纳入同一 16–64 KiB 范围。

## 13. RTT 自适应窗口

### 13.1 观测量

每个 stream 维护：

- minRtt：当前 epoch 的最小有效 parse-ACK RTT；
- srtt：alpha 为 1/8 的 EWMA；
- deliveryRate：新 ACK byte / ACK 间隔，alpha 为 1/4 的 EWMA；
- consumerQueueBytes：ACK 报告的 xterm queue；
- socketQueueBytes：Heartbeat 报告和本地 bufferedAmount；
- currentWindow、targetWindow；
- ackStallSince。

RTT sample 取“该累计 ACK 新覆盖的最早未确认 frame 的 send time”到 ACK 到达时间。重传或 snapshot overlap frame 不产生 sample。

### 13.2 算法

    onAck(ack):
      newlyAcked = max(0, ack.seq - cumulativeAckSeq)
      cumulativeAckSeq = max(cumulativeAckSeq, ack.seq)
      sampleRtt = now - oldestNewlyAckedFrame.sentAt
      minRtt = min(minRtt, sampleRtt)
      srtt = srtt is unset ? sampleRtt : 7/8 * srtt + 1/8 * sampleRtt
      sampleRate = newlyAcked / max(now - previousAckAt, 1 ms)
      deliveryRate = deliveryRate is unset
        ? sampleRate
        : 3/4 * deliveryRate + 1/4 * sampleRate

      bdp = deliveryRate * max(srtt, 1 ms)
      rawTarget = 2 * bdp + 4 * aggregatePayloadBytes
      target = roundUp64KiB(clamp(laneMin, rawTarget, laneMax))

      congested =
        consumerQueueBytes > currentWindow / 2 or
        socketQueueBytes > connectionSoftCap or
        srtt > 2 * minRtt

      if congested for 3 consecutive ACK intervals:
        currentWindow = max(
          inFlightBytes,
          laneMin,
          roundDown64KiB(max(target, currentWindow * 3/4))
        )
      else if target > currentWindow:
        growth = max(64 KiB, currentWindow / 4)
        currentWindow = min(target, currentWindow + growth)
      else if target < currentWindow * 3/4 for 3 intervals:
        currentWindow = max(inFlightBytes, laneMin, target)

      publish Credit when:
        absolute change >= 64 KiB or relative change >= 12.5%

2×BDP 允许一个窗口同时覆盖 network flight 和 xterm parse delay。4 个 aggregate payload 防止低 RTT 下窗口被估成单帧大小。

### 13.3 lane 参数

表中吞吐是单纯 window / RTT 的理论上限，不是产品吞吐承诺。

| Lane | 典型 RTT | min | initial | max | initial 理论范围 | max 理论范围 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Electron loopback | 0.3 ms | 256 KiB | 512 KiB | 2 MiB | 1,667 MiB/s | 6,667 MiB/s |
| LAN | 1 ms | 512 KiB | 1 MiB | 4 MiB | 1,000 MiB/s | 4,000 MiB/s |
| Tailscale | 10–40 ms | 1 MiB | 2 MiB | 8 MiB | 50–200 MiB/s | 200–800 MiB/s |
| Cloud relay | 50–200 ms | 1 MiB | 2 MiB | 8 MiB | 10–40 MiB/s | 40–160 MiB/s |
| Mobile cellular | 50–300 ms | 512 KiB | 1 MiB | 8 MiB | 3.3–20 MiB/s | 26.7–160 MiB/s |

connectionCreditBytes 默认上限：

- loopback：16 MiB；
- LAN：24 MiB；
- Tailscale / cloud relay：32 MiB；
- mobile cellular：16 MiB。

公平调度使用 deficit round robin，量子为 32 KiB。active、visible、parked 的权重分别为
8、4、1。控制 opcode、Input ACK、Heartbeat 和 snapshot control header 不消耗 Output deficit，并始终先于 bulk Output。

### 13.4 stall、pause 和恢复

当存在未 ACK Output 且连续 max(2 s, 4 × srtt) 没有 ACK 进展：

1. stream Credit 视为 0；
2. 停止发送新 Output；
3. 发送 Heartbeat；
4. 记录 ack_stall。producer pause/resume 规则：

- 未发送队列达到 75% per-stream cap，且该 PTY 的所有 delivery-interested view 都被 credit 阻塞时，调用 provider.pauseProducer。
- 队列降到 25% cap 后调用 provider.resumeProducer。
- 至少一个 view 仍在前进时，慢 view 不得暂停整个 PTY；慢 view 的队列越界后转 snapshot recovery。
- hidden 且无 delivery interest 的 stream 不参与 pause 判断；host model 继续摄取并直接丢弃 renderer delivery。
- provider 不支持 pause 时，队列达到 cap 后丢弃该 stream 的未发送 Output，发送 ModelRestore，并在 credit 恢复后发权威 snapshot。

默认 per-stream unsent cap 为 max(1 MiB, currentWindow)，硬上限 8 MiB；connection unsent 硬上限等于该 lane 的 connectionCreditBytes。

### 13.5 与 ws-outbound-backpressure-queue 的关系

packages/mobile-relay-protocol/src/ws-outbound-backpressure-queue.ts 继续作为最底层 socket 安全阀，但不再决定 terminal 语义：

- Credit 在 frame 进入 socket queue 前预留；queue 不得绕过 credit。
- queue 只保证已经 admission 的 frame 有序、不因 bufferedAmount 暂时升高而丢失。
- bulk lane 的 soft cap 必须可配置为 min(8 MiB, connectionCreditBytes / 2)。
- bulk lane hard cap 必须等于 connection unsent 硬上限，不沿用通用 queue 的 64 MiB 默认。
- groupKey 使用 epoch:streamId，便于诊断；不得在 queue 内按 group 丢帧。
- hard overflow 关闭整个 epoch；所有 stream 走统一 snapshot recovery。
- control WebSocket 继续使用自己的 queue，bulk overflow 不影响 control 调用。

Why：WebSocket bufferedAmount 是 transport pressure，parse ACK 是 consumer pressure。两层必须串联而不是各自缓存 64 MiB，否则自适应窗口失去有界内存含义。

## 14. 统一快照

### 14.1 快照内容

每个可用 snapshot 必须同时描述：

- normal buffer 的可见 screen；
- normal buffer 的 scrollback；
- alternate buffer 的可见 screen；
- 当前 activeBuffer；
- cols、rows；
- coverageEndSeq；
- pendingDeliveryStartSeq；
- pendingEscapeTail；
- cwd、lastTitle、OSC links 和 kitty keyboard flags 等恢复 metadata。

不允许只发 active buffer 后用 alternateScreen boolean 猜另一个 buffer。两个 screen 可以为空，但 section 必须显式存在。

### 14.2 SnapshotStartRecord，64 B

| Offset | 字段 | 类型 | 语义 |
| ---: | --- | --- | --- |
| 0 | snapshotId | u32 | 必须等于 correlationId |
| 4 | reason | u8 | 0 initial，1 manual，2 gap，3 reveal，4 reconnect，5 pressure，6 resized |
| 5 | source | u8 | 0 headless，1 provider；其他值保留 |
| 6 | activeBuffer | u8 | 0 normal，1 alternate |
| 7 | flags | u8 | bit0 truncated，bit1 byte-budget，bit2 cold-restore |
| 8 | cols | u16 | 1–1000 |
| 10 | rows | u16 | 1–500 |
| 12 | retainedScrollbackRows | u32 | 实际保留行数 |
| 16 | coverageStartSeq | u64 | 必须为 0 |
| 24 | coverageEndSeq | u64 | 必须等于 header.seq |
| 32 | pendingDeliveryStartSeq | u64 | 第 14.6 节 |
| 40 | normalScrollbackBytes | u32 | section 0 总长 |
| 44 | normalScreenBytes | u32 | section 1 总长 |
| 48 | alternateScreenBytes | u32 | section 2 总长 |
| 52 | pendingEscapeTailBytes | u32 | section 3 总长 |
| 56 | metadataBytes | u32 | section 4 总长 |
| 60 | reserved | u32 | 0 |

### 14.3 SnapshotChunkRecord

SnapshotChunk payload 至少 16 B：

| Offset | 字段 | 类型 | 语义 |
| ---: | --- | --- | --- |
| 0 | snapshotId | u32 | 必须等于 correlationId |
| 4 | section | u8 | 0 normal scrollback，1 normal screen，2 alternate screen，3 escape tail，4 metadata |
| 5 | reserved0 | u8 | 0 |
| 6 | reserved1 | u16 | 0 |
| 8 | sectionOffset | u32 | 从 0 连续递增 |
| 12 | dataBytes | u32 | payload 剩余长度 |
| 16 | data | bytes | section 内容 |

section 0–3 是 UTF-8 ANSI/text；section 4 是严格 JSON：

    {
      "cwd": string | null,
      "lastTitle": string | null,
      "oscLinks": Array<{
        "uri": string,
        "start": u32,
        "end": u32
      }>,
      "kittyKeyboardFlags": u32,
      "displayMode": "auto" | "desktop",
      "requestedScrollbackRows": u32
    }

### 14.4 SnapshotEndRecord，24 B

| Offset | 字段 | 类型 | 语义 |
| ---: | --- | --- | --- |
| 0 | snapshotId | u32 | 必须等于 correlationId |
| 4 | status | u8 | 0 complete，1 unavailable，2 too-large，3 superseded |
| 5 | flags | u8 | 必须为 0 |
| 6 | reserved | u16 | 0 |
| 8 | coverageEndSeq | u64 | 必须等于 header.seq |
| 16 | assembledBytes | u32 | 所有 section data 合计 |
| 20 | crc32c | u32 | 按 section 0→4 拼接后的 CRC32C |

客户端必须校验每个 section 的声明长度、连续 offset、assembledBytes 和 CRC32C，之后才可写入 xterm。

### 14.5 cap 与截断

客户端在 Subscribe 或 SnapshotRequest 声明 snapshotMaxBytes。服务端使用：

    effectiveCap = min(clientMax, serverDefault, 8 MiB hard cap)

serverDefault 初始为 2 MiB，保持现网 mobile 的内存上界。cap 只统计五个 section 的 data，不含 64 B Start、Chunk header、End 和 outer framing。截断算法必须确定性执行：

1. 先序列化 normal screen、alternate screen、pendingEscapeTail 和 metadata。
2. 这些 mandatory section 若已超过 effectiveCap，返回 too-large；不得发送不可恢复的部分 screen。
3. 用剩余预算保留 normal scrollback 的最新完整行。
4. 通过按行数二分重新调用权威 serializer，不能在任意 ANSI byte 处截断。
5. 实际 retainedScrollbackRows 小于 requested 时设置 truncated 和 byte-budget。
6. manual snapshot 的 requestedScrollbackRows 未给出时为 0；initial/reveal/reconnect 使用客户端 terminal scrollback policy，但仍受 cap。truncated snapshot 仍然可用，只表示较老 scrollback 被裁掉。too-large 或 unavailable 不可用，客户端必须保留当前画面并显式报告恢复失败。

### 14.6 coverage 与 pendingDeliveryStartSeq

coverageEndSeq 是 snapshot model barrier。pendingDeliveryStartSeq 是拍摄 barrier 时，该 stream 已经进入 delivery pipeline、仍可能在 snapshot 后到达客户端的最早 Output startSeq；没有这种 frame 时等于 coverageEndSeq。必须满足：

    0 <= pendingDeliveryStartSeq <= coverageEndSeq

恢复期间客户端暂存所有同 epoch Output。快照 parse 完成后：

1. endSeq 落在 `(pendingDeliveryStartSeq, coverageEndSeq]` 的 frame 是可能的 backlog duplicate，丢弃；等于 pendingDeliveryStartSeq 的 frame 不在该窗口中。
2. 横跨 coverageEndSeq 的 frame，从 coverageEndSeq 对应 UTF-8 boundary 切掉前缀后写入。
3. endSeq 小于等于 pendingDeliveryStartSeq 的 frame 不属于该 backlog window；它表明 sequence domain 变化或旧 frame，必须按 epoch/generation 规则处理，不能静默当 duplicate。
4. startSeq 大于 expectedSeq 是新 gap，立即放弃本次结果并重新恢复。服务端 SHOULD 在 snapshot barrier 后重新 frame 未发送 output，使 live 起点正好等于 coverageEndSeq；pendingDeliveryStartSeq 主要覆盖拍照前已经交给 socket 的 frame。

### 14.7 双屏恢复顺序

客户端必须在同一 structural replay barrier 内：

1. 暂停 live Output scheduler。
2. resize xterm 到 snapshot cols/rows。
3. 切到 normal buffer并清空 screen 和 scrollback。
4. 写 normal scrollback。
5. 写 normal screen。
6. 切到 alternate buffer并清空，写 alternate screen。
7. 切换到 activeBuffer。
8. 应用安全的 post-replay mode reset。
9. 最后写 pendingEscapeTail。
10. 等待全部 xterm write callback。
11. 回 Ack(kind=snapshot, seq=coverageEndSeq)。
12. 发布正 Credit 并排空经第 14.6 节处理后的 live Output。pendingEscapeTail 后不得插入任何 reset 或 ESC；下一段 live Output 必须直接延续它。

## 15. snapshot 并发与恢复状态机

### 15.1 优先级

snapshot 请求优先级从高到低：

1. epoch reconnect、gap、pressure 触发的 recovery；
2. reveal；
3. resized reflow；
4. manual。每个 stream 同时只能有一个 snapshot group。高优先级请求到达时：

- 未开始发送的低优先级 snapshot 直接取消；
- 已发送 SnapshotStart 的 snapshot 必须以 SnapshotEnd(superseded) 结束；
- 随后分配新 snapshotId；
- 客户端不得把不同 snapshotId 的 chunk 淞在一起。

manual 请求在 recovery 期间收到 Ack(kind=control, busy)。客户端可在 stream 回到 live 后重试。Why：旧实现等 manual snapshot 完成后才发 recovery，可能延长已确认损坏的画面。本协议让恢复抢占，并用 snapshotId 消除 frame group 猜测。

### 15.2 状态机

    DETACHED
      | Subscribe + Epoch accepted
      v
    SUBSCRIBING
      | Subscribed(initialState=snapshot)
      v
    SNAPSHOTTING
      | valid SnapshotEnd + xterm parse + snapshot Ack
      v
    LIVE <-------------------------------+
      |                                 |
      | VisibilityGate(hidden,no interest)
      v                                 |
    GATED -- RevealSnapshot ----------> RECOVERING
      ^                                 |
      |                                 | valid snapshot + parse ACK
      +---------------------------------+

    LIVE -- gap / ModelRestore / epoch change / queue overflow --> RECOVERING
    ANY  -- End / Unsubscribe / fatal protocol error -----------> CLOSED

RECOVERING 中：

- output Credit 为 0；
- Input 默认仍可发送，但必须走显式 server ACK；
- resize/claim 可排队一个 latest-wins 值；
- signal/kill 不排队，直接发并显式确认；
- side effects 按 seq 暂存，snapshot replay attention 不重放。

## 16. Epoch、断线和恢复

### 16.1 三种 generation

| 名称 | 范围 | 变化条件 | 用途 |
| --- | --- | --- | --- |
| connectionGeneration | control transport | control reconnect | 防止旧 capability/endpoint 结果覆盖新连接 |
| epoch | bulk socket | 每次 bulk WebSocket | 丢弃旧 socket 的迟到 frame |
| transportGeneration | PTY delivery owner | spawn/attach/transport 切换 | 防止旧帧和 PTY id 复用 |

outputSeq 跨 bulk epoch 连续，但不跨 transportGeneration。客户端保存的 resume marker 必须同时带 transportGeneration 和 lastParsedSeq。

### 16.2 统一恢复路径

以下事件完全等价地触发 recover(reason)：

- WebSocket close/error；
- Heartbeat timeout；
- output gap；
- ModelRestore；
- ws outbound hard overflow；
- iOS 从后台恢复且旧 socket 不再新鲜；
- relay-moved；
- control connectionGeneration 变化；
- server 以 superseded 关闭旧 epoch。

    recover(reason):
      set every stream Credit to 0
      freeze old epoch; discard later old-epoch frames
      cancel manual snapshots as superseded
      close old bulk socket
      refresh status/capability on current control generation
      redeem a new bulk ticket
      establish and accept a new epoch
      for each still-attached transportGeneration:
        Subscribe(lastParsedSeq, delivery state)
        require initialState=snapshot
        apply authoritative snapshot
        ACK snapshot after xterm parse
        restore adaptive Credit from lane initial value

本协议不跨 epoch 做 raw replay，即使 server 暂存了 lastParsedSeq 之后的 byte，也仍发 snapshot。Why：iOS suspend 和 relay cell migration 的停顿长度不可预测。统一为 snapshot 能把所有恢复正确性压缩到一个 seam，避免为每种断线来源维护不同 replay retention 假设。

### 16.3 relay-moved

收到 packages/mobile-relay-protocol/src/mobile-relay-phone-protocol.ts 定义的 relay-moved 后：

1. 校验 assignmentEpoch 大于已接受值。
2. 不在旧 cell 上继续发 terminal Input。
3. 通过 control transport 更新 cellUrl。
4. 关闭旧 bulk epoch。
5. 按第 16.2 节恢复。旧 assignmentEpoch、旧 connectionGeneration 或旧 epoch 的 frame 均静默丢弃并计数。

### 16.4 iOS 后台

进入 background 前若 JS 仍可运行，mobile SHOULD 对可见 stream 发送 VisibilityGate(visible=false, deliveryInterest=false)，然后把 Credit 降为 0。回到 foreground 时，满足任一条件就必须抛弃旧 socket：

- background 超过 5 秒；
- 最后一个已认证 frame 超过一个 heartbeat interval；
- connectionGeneration 已变化；
- WebSocket readyState 不为 OPEN。

不得等待旧 socket 再次超时；直接走统一恢复路径。

## 17. Hidden delivery gate

### 17.1 gate 判定

服务端的 effective delivery 条件为：

    shouldDeliver = visible or deliveryInterest

priority 只影响调度，不改变 shouldDeliver。当 shouldDeliver 从 true 变 false：

1. 服务端有序处理 VisibilityGate 到当前 model barrier。
2. 不再把新 Output 加入该 stream delivery queue。
3. 丢弃未发送 Output；已经在 wire 上的 Output 仍需 ACK 或随 epoch 释放。
4. host headless xterm、query responder、side-effect parser 和 PTY read 必须继续。
5. 服务端回 Ack(kind=control, seq=currentOutputSeq)。
6. stream 进入 GATED。deliveryInterest 是 refcount 聚合后的 bool。renderer 内任何 raw-byte sidecar、eager pre-mount buffer 或 query consumer 存在时都必须为 true。

### 17.2 reveal

visible 从 false 变 true 不得直接恢复 Output。客户端必须：

1. 发送 VisibilityGate(visible=true) 但维持 Credit 0。
2. 收到 gate ACK 后发送 RevealSnapshot，携带同一 stateVersion。
3. 服务端确认 stateVersion 仍为最新。
4. 服务端发 reason=reveal 的权威 snapshot。
5. 客户端按第 14.7 节恢复并 ACK。
6. 客户端发布正 Credit。如果 reveal 过程中又 hidden，新 stateVersion 使旧 snapshot superseded；客户端不得短暂绘制它。

### 17.3 side effects while hidden

host 继续生成 title、bell、agent、command-finished、PR link 和 mode-2031 facts。策略如下：

- title state 可在 attach/reveal snapshot 中重放最新值；
- bell、agent transition、command completion 等 attention facts 只 live-deliver，不历史重放；
- hidden view 是否产生通知由 renderer store policy 决定，不由 transport 决定；
- SideEffectBatch 的 seq 让 client 在对应 Output 解析完成后再应用同批事实。

## 18. Side effects、metadata、clear 与 model restore

### 18.1 SideEffectBatch

SideEffectBatch JSON 与 packages/shared/src/terminal/side-effect-facts.ts 的事实 union 对齐：

    {
      "facts": Array<
        title | bell | agent-working | agent-idle | agent-exited |
        command-finished | pr-link | command-code-working |
        command-code-done | 2031-subscribe
      >,
      "replay": boolean,
      "worktreeId"?: string,
      "tabId"?: string,
      "paneKey"?: string,
      "connectionId"?: string | null
    }

header.seq 是该 batch 已观察到的 output byte high-water。客户端在 parsedSeq 大于等于它之后应用 facts。同 seq 的 batch 按到达顺序应用。replay=true 时 facts 只能包含 title。包含 attention fact 的 replay batch 是 protocol error。

### 18.2 Metadata

Metadata JSON：

    {
      "cwd"?: string | null,
      "lastTitle"?: string | null,
      "displayMode"?: "auto" | "desktop"
    }

metadata 按 header.seq 与 Output 排序。客户端可在 parsedSeq 达到该值后发布。

### 18.3 ClearBuffer

client→server：

    { "operation": "request" }

server→all attached streams：

    { "operation": "applied", "initiatorClientId": string | null }

服务端必须把 clear 排入与 headless xterm output 相同的 per-PTY chain，清 provider buffer 和 headless buffer，再以当时 outputSeq 发 applied。请求方收到 Ack(kind=control, accepted) 表示 host 已接受并完成该 barrier。renderer MAY 乐观清屏，但必须把 applied 当作幂等 authoritative clear。断线发生在 request 和 ACK 之间时，重连 snapshot 决定最终状态；客户端不得盲目重发非幂等 control。

### 18.4 ModelRestore

ModelRestore JSON：

    {
      "reason":
        "hidden-drop" | "pending-cap" | "ack-stall" |
        "sequence-gap" | "provider-gap" | "renderer-replaced",
      "markerSeq": decimal-u64-string,
      "snapshotFollows": boolean
    }

visible stream 收到后立即进入 RECOVERING 并把 Credit 置 0。snapshotFollows=true 时服务端必须自动发送 recovery snapshot；hidden stream 只 latch，等 RevealSnapshot。

## 19. 输入与控制路径

### 19.1 correlationId

客户端为 Input、Resize、ClaimViewport、SnapshotRequest、RevealSnapshot、ClearBuffer、Signal、Kill 和 Unsubscribe 分配非零 u32 correlationId。一个 epoch 内，在收到 ACK 或 Error 前不得复用；耗尽时建立新 epoch。服务端缓存最近 1,024 个已完成 correlationId 及结果，重复请求返回同一 ACK，不重复执行。缓存只在 epoch 内有效。

### 19.2 Input

- InputRecord.data 是原始 UTF-8 input，dataBytes 必须与剩余 payload 长度一致。
- 单帧 data 最多 64 KiB；更长 paste 分帧，每帧独立 inputId。
- 服务端按 inputSeq 严格有序；gap 返回 input_gap。
- write accepted ACK 必须显式返回。
- input floor、permission 或 viewport claim 拒绝必须给错误码，不能静默丢弃。
- kind=query-reply 只允许 host terminal query responder 产生；它绕过用户 input floor，但仍须 generation 校验和显式 ACK，且不得夺取 mobile input floor。

### 19.3 Resize 与 Resized

Resize JSON：

    {
      "cols": u16,
      "rows": u16,
      "reason": "fit" | "user" | "restore-pulse"
    }

服务端回 Ack 后再发 Resized：

    {
      "cols": u16,
      "rows": u16,
      "displayMode": "auto" | "desktop",
      "reason": "apply-layout" | "mode-change" | "provider",
      "applied": boolean
    }

同一 stream 多个未执行 Resize 可以 latest-wins，但每个 correlationId 都必须得到 accepted、superseded 或 rejected ACK。alternate-screen 同尺寸 restore pulse 不得被无条件去重。normal buffer 宽度变化需要 reason=resized 的完整 snapshot 以重排 scrollback；alternate buffer 只需 Resized 并等待 TUI 的 SIGWINCH repaint。

### 19.4 ClaimViewport

Claim JSON：

    {
      "action": "register" | "claim" | "release" | "report",
      "cols": u16,
      "rows": u16,
      "clientId": string
    }

register 记录 stream-scoped geometry；claim 争取 input/width driver；release 只释放本 stream 建立的 claim；report 只更新 desktop restore baseline，不 resize PTY。Ack 的 accepted/rejected 明确说明结果。服务端随后用 FitOverride 和 Driver 广播权威状态。

### 19.5 Signal

Signal JSON：

    {
      "signal":
        "SIGINT" | "SIGTERM" | "SIGKILL" | "SIGQUIT" |
        "SIGHUP" | "SIGWINCH" | "SIGTSTP" | "SIGCONT"
    }

provider/平台不支持的 signal 返回 unsupported_signal。不得把未知 string 传给 OS API。Windows adapter 负责映射或明确拒绝，不由 client 猜测平台。

### 19.6 Kill

Kill 必须校验 transportGeneration，执行 keepHistory 语义，并回 Ack。accepted 只表示 shutdown 流程已启动；最终生命周期由 End 确认。相同 correlationId 重复不能杀死复用同一 ptyId 的新 generation。

## 20. spawn / attach 结果 parity

spawn、attach 和 terminal lifecycle 仍走 control oRPC。大块 snapshot/replay 内容不放在 control reply，而由新 stream 的首个 snapshot 传输。control result 必须精确返回：

    {
      "terminal": string,
      "ptyId": string | null,
      "transportGeneration": UUID string,
      "isReattach": boolean,
      "sessionExpired": boolean,
      "restore": {
        "kind": "none" | "snapshot" | "replay" | "cold-restore",
        "snapshotCols"?: u16,
        "snapshotRows"?: u16,
        "isAlternateScreen": boolean,
        "cwd"?: string,
        "startupCwdFallback"?: {
          "kind": "worktree",
          "cwd": string
        }
      },
      "providerSequence"?: {
        "value": decimal-u64-string,
        "generation": "continued" | "reset"
      }
    }

首个 SnapshotStart flags 和 metadata 必须与 result.restore 一致。

| 现有 spawn/attach 字段 | 新位置 |
| --- | --- |
| id / terminal handle | control result |
| snapshot | Snapshot normal/alternate sections |
| snapshotCols / snapshotRows | control result + SnapshotStart |
| snapshotKittyKeyboardFlags | snapshot metadata |
| isReattach | control result |
| isAlternateScreen | control result + SnapshotStart.activeBuffer |
| replay | reason=initial snapshot，source=provider；不再裸 replay |
| sessionExpired | control result |
| coldRestore.scrollback/cwd/oscLinks | cold-restore snapshot sections/metadata |
| startupCwdFallback | control result |
| providerSequence | control result；host 转成当前 wireByteSeq domain |

Why：现有 snapshot > replay > coldRestore 优先级由 renderer 分支决定，且 control reply 可能携带大字符串。本协议在 host 侧把三者归一为权威 snapshot，renderer 只实现一次恢复算法，同时保留上层需要展示的 attach outcome。

## 21. 安全

### 21.1 loopback 免 E2EE 的必要条件

只有同时满足以下条件才允许 plaintext terminal frame：

1. server 只监听 IPv4 127.0.0.1 的 OS 分配端口；不得监听 0.0.0.0、LAN 地址或 IPv6 wildcard。
2. accepted socket 的 remoteAddress 必须为 127.0.0.1。
3. Host header 必须精确匹配 main 分配的 127.0.0.1:port。
4. HTTP upgrade Origin 必须在 main 生成的精确 allowlist 中： - packaged build 为实际 Electron file renderer origin；- dev build 为 ELECTRON_RENDERER_URL 的 exact origin；- 缺失、null、通配和普通网页 origin 默认拒绝。
5. 首个应用 frame 在 2 秒内提交至少 256 bit 的 process-scoped token。
6. token 由 main 通过 audited bootstrap adapter 交给 renderer；不得进入 URL、localStorage、日志、crash breadcrumb 或 analytics。
7. token 比较使用 constant-time compare；连续失败受速率限制。
8. BrowserWindow 保持 contextIsolation、sandbox 和 webSecurity。任一条件不满足时必须拒绝连接，不能自动降级为“loopback 所以可信”。token 每次 app 启动轮换；renderer reload 可以复用同一 process token，app restart 不可复用。

### 21.2 E2EE lane

LAN、Tailscale、cloud relay 和 cellular 必须使用：

    terminal inner frame
      -> 40 B oRPC request-id envelope
      -> one AEAD binary plaintext
      -> one wss WebSocket message

AEAD 覆盖 outer requestId、inner header 和 payload。relay 只能看到 ciphertext 长度、方向和时序，不能看到 routeId、opcode、epoch 或 terminal 内容。当前 mobile E2EE framing 的固定开销为：

- 24 B nonce；
- 42 B encrypted session/direction/kind/counter header；
- 16 B secretbox authenticator；
- 合计 82 B。

每个方向使用独立 key 和单调 u64 counter。counter 不符、nonce 不符或认证失败都必须立即关闭 epoch；不得尝试跳过坏 frame 后继续。每个新 socket 重新握手并产生新 key/sessionId。wss 仍是必须项：它保护 endpoint metadata、握手可用性和流量到 relay 的外层；E2EE 则保证 relay 不可信时的内容机密性与完整性。

### 21.3 每帧开销

当前 36 B requestId、40 B terminal header 下：

| Lane | 固定开销 | 16 KiB payload | 32 KiB payload | 64 KiB payload |
| --- | ---: | ---: | ---: | ---: |
| loopback，无 E2EE | 80 B | 0.488% | 0.244% | 0.122% |
| E2EE | 162 B | 0.989% | 0.494% | 0.247% |

WebSocket 自身 2–10 B framing 和 TLS record 开销不在表内。小 Input/control frame 的相对比例会更高，但绝对 byte 很小。性能报告中，8 KiB payload 每帧构造现有 40 B oRPC envelope 的组为 1,177.0 MiB/s，裸 ArrayBuffer copy 组为 1,167.2 MiB/s，差异为 +0.8%，方向和幅度都属于测量噪声。因此风险是重复 allocation/copy 与长时 GC，不是这 40 B header 的吞吐。

## 22. 单版本切换

### 22.1 capability

服务端只有在以下行为全部可用时才可 advertise terminal.multiplex：

- bidirectional WebSocket binary side channel；
- parse-complete cumulative byte ACK；
- adaptive Credit；
- hidden gate + reveal snapshot；
- 双屏 snapshot + pendingDeliveryStartSeq + pendingEscapeTail；
- side-effect/clear/model-restore；
- explicit write/control ACK；
- spawn/attach parity；
- epoch recovery；
- exclusive admission。

部分实现不得 advertise capability。本次是破坏性替换，必须提高 RUNTIME_PROTOCOL_VERSION 和所有 minimum compatible versions，令不匹配的 client/server 在 control 握手时 fail closed。

### 22.2 唯一协议

- 服务端只 advertise terminal.multiplex，不 advertise 旧 terminal binary capabilities。
- terminal.multiplex 调用参数必须是 `{ "bulkTicket": string }`；其他字段或无效 ticket 在 binary frame admission 前拒绝。
- server binary bundle 不包含旧 decoder；client bundle 不包含旧 local/remote adapter。
- 旧 client 连接新 server、新 client 连接旧 server 都在 control compatibility 握手失败，不尝试降级或猜 frame version。

### 22.3 per-PTY owner

control plane 为每次 spawn/attach/transport switch 生成 transportGeneration。注册 delivery owner 必须做 compare-and-set：

    claim(ptyId, transportGeneration, transportKind)

transportKind 在本协议中恒为 multiplex。相同 generation 的第二个 owner 必须失败为 transport_generation_claimed。listener 注册、初始 snapshot 和 Output 都必须发生在 claim 成功之后；发现任何 legacy listener 是发布阻断错误。

### 22.4 协调式发布

1. 未 advertise 的开发 build 完成全部语义和安全闸门。
2. Electron、LAN/Tailscale、web、mobile 分别以只含新协议的内部 server/client 对 canary。
3. 同一 release train 删除旧 decoder/adapter、提升兼容版本并协调发布；不做双栈灰度。
4. 故障时回滚整套匹配 release，不运行时 fallback。shadow codec 只可读复制数据，不得注册 PTY listener、发 renderer frame 或进入 production bundle；发布检查证明源码、产物、capability 只剩一个 multiplex。

## 23. 错误码与可观测性

ErrorRecord JSON：

    {
      "code": string,
      "message": string,
      "fatal": boolean,
      "retryable": boolean
    }

wire errorCode：

| 值 | 名称 | 值 | 名称 |
| ---: | --- | ---: | --- |
| 0 | none | 7 | unsupported_signal |
| 1 | invalid_payload | 8 | snapshot_busy |
| 2 | unknown_stream | 9 | snapshot_too_large |
| 3 | stale_epoch | 10 | provider_unavailable |
| 4 | stale_transport_generation | 11 | connection_use_conflict |
| 5 | input_locked | 12 | input_gap |
| 6 | viewport_rejected | 13 | operation_superseded |

必须按 lane、environment、epoch、stream 采集：opcode bytes/count；Credit/in-flight/unsent/socket
queue；RTT/rate/ACK stall/xterm parse latency；producer pause；snapshot reason/size/rows/truncate/
duration；gap/reconnect/hidden drop/version rejection/owner；heap/RSS/GC pause。

epoch、streamId、terminal handle 和 token 只记录不可逆短 fingerprint。cwd、input、output、snapshot data、side-effect title 和 URL 不得进入 telemetry。

## 24. 与现有实现的偏离及 Why

| 决定 | 现状 | 新协议 | Why |
| --- | --- | --- | --- |
| 物理 lane | 本地 IPC/计划 MessagePort；远端 WS | 只有 WS | 终态是一种 transport，避免两套恢复语义 |
| stream header | 16 B，无 payload length/epoch | 40 B，显式 length/epoch/correlation | 可安全解析、拒绝迟到代际并确认控制 |
| streamId reuse | wrap 后找空 slot | epoch 内永不复用 | 迟到 frame 不会命中新 stream |
| output sequence | 主要为 UTF-16 char | UTF-8 byte | 与 wire、credit、内存和 gap 使用同一单位 |
| ACK | 本地 parse 后 char；远端 receive 后 byte delta | parse 后 byte cumulative | 反压真实覆盖 xterm，丢 ACK 可自愈 |
| window | 固定 512 KiB/2 MiB 等 | RTT/BDP 自适应且有上下界 | 512 KiB 在 4 ms 实测已跌破 PTY bar，远程 RTT 更高 |
| socket queue | 独立 8/64 MiB valve | 受 Credit admission，bulk hard cap 收紧 | 防止两层缓存叠加成无界语义 |
| snapshot grouping | 靠 Start/Chunk/End 与 requestId 猜 target | snapshotId、优先级和 superseded End | 消除 manual/recovery 竞态 |
| snapshot content | 本地富 metadata；远端 active ANSI + 2 MiB cap | 双屏、coverage、pendingDeliveryStartSeq、统一截断 | 所有 client 使用同一恢复算法 |
| hidden | 本地专有 | per-stream VisibilityGate + RevealSnapshot | 远端长 hidden 和 iOS 恢复也有界 |
| side effects | 本地独立 IPC；远端缺失 | seq-addressed SideEffectBatch | 保持 title/bell/agent 语义，避免与 output 乱序 |
| write | 本地 writeAccepted 可确认；远端可能静默 | 每个 Input 显式 ACK | Ctrl+C/Escape 是否到 host 可判定 |
| resize/signal/kill/claim | 多为 fire-and-forget 或不完整 | correlationId + ACK | 失败、supersede 和平台不支持均显式 |
| reconnect | connection close 后各 client 自行重订阅 | epoch + 单一 snapshot recovery | gap、iOS、relay move 共用一个可验证 seam |
| replay/cold restore | renderer 决定 snapshot/replay/coldRestore 优先级 | host 归一为 initial snapshot | 减少分支并保持权威来源一致 |
| recovery vs manual | recovery 等 manual 结束 | recovery 抢占并终止 manual | 已损坏画面优先恢复 |

## 25. 切换闸门

以下项目全部通过之前，不得让 production advertise terminal.multiplex。

| Gate | 全部必需 |
| --- | --- |
| 语义 | Output text/byte-seq/background/gap parity；parse-complete ACK；epoch/heartbeat health；hidden/refcount/reveal；双屏 snapshot、pendingDeliveryStartSeq、escape tail、截断；side effects、clear、restore；write/control ACK；viewport/fit/driver；spawn/attach/cold restore；End ordering；统一 reconnect；唯一 owner、无旧 listener |
| 性能 | 16–64 KiB 聚合；吞吐高于目标机 xterm；sandboxed real-DOM、Windows ConPTY/CJK/TUI/SIGWINCH、低配机 canary；LAN/10–40/50–200/50–300 ms；30 分钟 flood/GC 稳态；可解释 ACK/window/pause；iOS 10 秒/2 分钟/15 分钟恢复；Input/snapshot/hidden 中 relay-moved |
| 安全/切换 | exact 127.0.0.1/Origin/Host/token；token 不入 URL/log/telemetry；逐帧 E2EE fail closed；relay 不见内容/header；版本不匹配在 control 拒绝；bundle 无旧 decoder/adapter/capability/fallback；完整行为前不 advertise |

D2 验收基线：raw PTY 119.57 MiB/s，headless xterm 111.15 MiB/s；8 KiB payload、512 KiB
window 在 1 ms ACK 为 241.2 MiB/s，4 ms 仅 88.4 MiB/s。MessagePort 不支持 transferable
ArrayBuffer；30 分钟 GC soak、真 DOM、Windows 和低配机仍是硬闸门。

### 25.1 当前发布状态

`terminal.multiplex` 目前仅是受控 canary capability。所有 desktop、packaged desktop 和
headless `serve` 进程默认不 advertise；仅在启动进程显式设置
`YIRU_TERMINAL_MULTIPLEX_CANARY=1` 时 advertise。该开关只用于开发和手工 canary，不是
production rollout 开关。未看到 capability 的 client 必须拒绝打开 bulk ticket；server 也必须
以 `capability_unsupported` 拒绝 `terminal.openMultiplex` 和 `terminal.multiplex`。唯一例外是
Electron 的 hardened loopback；这条不 advertise 的内部路径保留本机桌面核心 terminal，但
不会向 Web/mobile、普通 runtime socket 或 paired RPC 开放。所选 runtime 必须显式启用 canary
并 advertise 后，Electron 才连接其 multiplex transport。

已有 canary 证据仅包括：macOS packaged 真实 xterm 的 CJK/emoji、hidden→reveal、
renderer reload 和 100 MiB 输出；以及 iOS 模拟器 echo、50 MiB 输出、后台超过 10 秒恢复、
host restart 后 E2EE 重连和 snapshot。这些不满足本节全部闸门。Windows
ConPTY/CJK/TUI/SIGWINCH、低配机、30 分钟 flood/GC、各 RTT 档、relay-moved，iOS
2/15 分钟恢复、产物 legacy sweep 和跨平台 packaged Origin 仍待真实验证。

## 26. 开放问题

以下问题不能由本设计包单方面定案；实现开始前必须指定 owner、记录选择与证据。

### OQ-1：packaged Electron 的精确 Origin

推荐在目标 Electron 上 probe packaged `loadFile` 与 dev URL 的实际 Origin，只 allowlist exact value；若 packaged 为 null，优先用受信 custom scheme。备选是额外绑定 WebContents nonce 后接受 null，或由 preload/main 建 socket。Owner：desktop security；证据：macOS/Windows/Linux probe。

当前选择：development 精确匹配 `ELECTRON_RENDERER_URL` origin，packaged 精确匹配
Chromium `loadFile` WebSocket 序列化的 `file://`。macOS canary 已验证伪造 Origin/Host 和错误
token 被拒绝；Windows/Linux packaged probe 未完成，因此发布闸门仍关闭。

### OQ-2：统一 snapshot 默认 cap

推荐所有 lane 先用 2 MiB，以 telemetry 决定 desktop 是否升到 4/8 MiB。备选是本地 8 MiB、远程 2 MiB，或全部 8 MiB。Owner：mobile memory；证据：mandatory 双屏分布与 30 分钟 soak。无论选择何值，8 MiB hard cap 和确定性截断不变。

当前选择：所有 lane 默认 2 MiB，hard cap 8 MiB。模拟器 50 MiB 输出未等价于
mandatory 双屏 snapshot 分布或 30 分钟 soak；证据未完整。

### OQ-3：E2EE framing 是否直接复用现有 82 B secretbox

推荐首版复用 mobile 的 82 B secretbox framing/key schedule。备选是带显式 AAD 的 XChaCha20-Poly1305，或协商 AES-GCM。Owner：security；若换 suite，必须冻结新的 overhead、counter、nonce、downgrade 规则，decoder 不得猜 suite。

当前选择：复用 mobile secretbox framing/key schedule；iOS 模拟器已证明 host restart
后重新握手。relay/cellular 上的逐帧 fail-closed 和不可见性未验证。

### OQ-4：relay 的 bulk QoS class

推荐 relay 认证 control/terminal-bulk lane class，control 优先，bulk 独立 32 MiB 并按连接公平调度；不看 encrypted opcode。备选是单 tunnel 双 queue，或独立连接/配额。Owner：relay；证据：cell memory、连接数和迁移约束。任何方案都不得让 bulk 拖垮 control。

当前状态：control 与 bulk 已用独立 WebSocket 隔离；relay QoS class、配额和公平调度
未定案，不得视为已完成。

### OQ-5：多 viewer 下 producer pause 的产品策略

推荐仅在所有 interested viewer 阻塞时 pause；慢 viewer 自行 snapshot-heal。备选是仅 lossless primary 可 pause，或 remote 永不 pause。Owner：terminal product；必须决定远程观察者能否改变 shell 物理速度，并把选择做成 host policy，不能信任 client 自报 primary。

当前选择：host 仅在所有参与压力决策的 viewer 均阻塞时 pause producer。多 viewer
与慢 viewer canary 证据未完成。

### OQ-6：是否增加跨 epoch raw resume

推荐首版永远 snapshot；有数据证明它是瓶颈后，才以 terminal.multiplex.resume 增加 bounded replay。备选是首版每 PTY 保留 8 MiB，或仅 loopback/LAN resume。Owner：performance；证据：snapshot serialize/apply、内存和断线长度。任何 resume 必须保留 gap→snapshot fallback，且不改本协议的 seq 定义。评审必须记录协议结论、六项 owner/选择/证据、冻结的 frame/opcode、canary 与回滚 owner；在此之前 production MUST NOT advertise terminal.multiplex。

当前选择：跨 epoch 永远 snapshot，不实现 raw replay。renderer reload 和 iOS host restart
canary 已观察到 snapshot 恢复；长断线与完整内存证据仍缺失。回滚 owner 和 production
rollout 仍未定，所以 §25.1 的显式 canary gate 保持关闭。
