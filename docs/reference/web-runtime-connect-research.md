# Web 端本机 Runtime 连接：竞品研究与 Yiru 落地计划

状态：Plan / No-login security decision accepted<br>
研究日期：2026-08-12<br>
范围：最终用户从 `app.yiru.ai` 安装、配对并让本机 Yiru runtime 主动连接云端 Web 控制台

## 1. 结论

建议把最终体验收敛成两个正常入口、一个始终相同的运行命令：

```bash
# 安装：从 app.yiru.ai 的下载入口取 .dmg / .AppImage / .deb / .rpm 自行安装
#（原先的 `curl -fsSL https://yiru.ai/install.sh | sh` 已下线，脚本不再发布）

# Web 控制台生成；pair 只在首次出现
yiru connect --pair yrp_<single-use-secret>

# 此后每次运行
yiru connect
```

产品决策：当前版本不要求登录，也不建设账号身份。浏览器本身是一个独立的授权设备：首次访问时
在专用 Workbench origin 生成不可导出的设备私钥，配对后由该私钥证明访问权。同一个浏览器可以
再次访问已配对机器；换浏览器、无痕窗口或清除站点数据后必须重新配对，不提供账号恢复捷径。

Web 端应该实时观察配对状态，CLI 一连上就自动进入下一步，不要求用户把 runtime 地址、
WebSocket URL、API key 或机器 ID 再复制回浏览器。连接生命周期完全由用户当前执行的
`yiru connect` 管理：命令运行时在线，用户退出命令后离线，不创建开机启动项或后台服务。

这套设计综合了几种经过验证的做法：

- GitHub CLI / VS Code Remote Tunnels：首次浏览器授权，凭据落入本机安全存储；以后命令不再带
  token。
- Cloudflare Tunnel / ngrok：本机只建立出站连接，不要求开放公网端口。
- Tailscale：注册凭据和注册后的设备身份分离；一次性 key 用完自动失效，删除设备才真正撤销
  已注册节点。
- Gitpod Runner：Web 控制面签发一次性 `exchangeToken`，runner 用它换取自己的长期身份；这是
  与 Yiru 的 Web-first 配对最接近的公开实现。

仓库里的 `yiru` CLI 通过 Electron 的 Node runtime 运行，headless runtime 又依赖 `node-pty`
原生模块。首个 macOS/Linux 版本先从已签名、已公证或带构建 provenance 的完整发行包中提取同一
个 CLI/runtime-host，避免并行维护第二套运行时；更小的无 GUI artifact 是后续体积优化。

Yiru 不应照搬 Cloudflare/ngrok 把长期 bearer token 放进命令行。`--pair` 必须是高熵、短期、
单次兑换的 enrollment grant；grant 同时绑定浏览器公钥。CLI 在本机生成机器密钥，双方核对同一
个短验证码后才建立授权。后续连接由浏览器和机器分别签名服务端 challenge，一次性短时 connection
ticket 必须与对应设备密钥绑定，不能只凭 Cookie、URL 或可复制 bearer 获得机器权限。

## 2. 竞品如何做

### 2.1 GitHub CLI 与 Codespaces

GitHub CLI 的默认入口是 `gh auth login`。它优先打开浏览器完成授权，也可以把一次性 OAuth
device code 复制到剪贴板；成功后把 token 存入系统 credential store，系统存储不可用时才退回
明文文件，并明确提供 `--insecure-storage`。自动化场景则从标准输入或 `GH_TOKEN` 取 token，
避免把 PAT 写进参数。来源：[gh auth login 官方手册](https://cli.github.com/manual/gh_auth_login)。

GitHub 的 device flow 是 OAuth 2.0 Device Authorization Grant：CLI 先拿 `device_code`、
`user_code` 和 verification URI，再按照服务端返回的 polling interval 查询结果；code 有明确过期
时间，授权完成后才返回 access token。GitHub 也明确提醒 device flow 只应用在 CLI、IoT、
headless 等受限环境，普通有浏览器的 native client 更适合 authorization code + PKCE。
来源：[GitHub OAuth device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、
[GitHub OAuth 安全建议](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app)。

完成一次 `gh auth login` 后，用户直接使用 `gh codespace ssh -c <name>`；Codespaces 自动创建
本地 SSH key 来减少二次认证。来源：
[Using GitHub Codespaces with GitHub CLI](https://docs.github.com/en/codespaces/developing-in-a-codespace/using-github-codespaces-with-github-cli)。

GitHub CLI 官方源码目前采用 Go、Cobra、`github.com/cli/oauth`、
`github.com/zalando/go-keyring` 和 backoff 库；这说明 auth、keyring 和 reconnect 是独立模块，
而不是散落在每个命令里。来源：
[GitHub CLI `go.mod`](https://github.com/cli/cli/blob/trunk/go.mod)。

对 Yiru 的启示：

- 首次认证有状态，日常命令无 token。
- CLI-first 的无浏览器兜底可以采用 RFC 8628；已经从 Web 控制台发起的 Web-first 场景不必再让
  用户输入一遍 human code。
- credential store 失败必须显式报错或取得用户确认，不能静默降级成明文。

### 2.2 VS Code Remote Tunnels / Microsoft Dev Tunnels

VS Code 的远端用户只需下载独立 `code` CLI 并运行：

```bash
code tunnel
```

该命令会下载并启动 VS Code Server、建立 tunnel，然后直接输出可打开的
`https://vscode.dev/tunnel/<machine>/<folder>` URL。host 与浏览器端都用同一个 GitHub 或
Microsoft 账号认证。需要常驻时使用 `code tunnel service install`，另有 status、restart、kill、
unregister、service log 和 uninstall 等生命周期命令。来源：
[VS Code Remote Tunnels](https://code.visualstudio.com/docs/remote/tunnels)、
[VS Code CLI tunnel 命令源码](https://github.com/microsoft/vscode/blob/main/cli/src/commands/tunnels.rs)。

Microsoft 独立 `devtunnel` CLI 默认使用交互浏览器，headless 时支持 device-code login；登录 token
缓存到系统 secure keychain，`logout` 清除本机缓存。host 通过 `wss://.../Host/Connect/...`
主动连 relay，默认只有创建 tunnel 的账号能访问。来源：
[Dev Tunnels quickstart](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/get-started)、
[Dev Tunnels CLI reference](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/cli-commands)。

VS Code CLI 官方源码是 Rust，采用 `clap`、`reqwest`、`tokio`、`tokio-tungstenite`、
Microsoft `dev-tunnels` 和跨平台 `keyring` crate。认证代码保存 access/refresh token、自动刷新，
Linux keyring 调用还专门设了 5 秒超时并提供权限为 `0600` 的文件 fallback。来源：
[VS Code CLI `Cargo.toml`](https://github.com/microsoft/vscode/blob/main/cli/Cargo.toml)、
[VS Code CLI `auth.rs`](https://github.com/microsoft/vscode/blob/main/cli/src/auth.rs)。

对 Yiru 的启示：

- `yiru connect` 应把“启动 runtime + 建立云连接 + 输出 Web ready 状态”合并成一次动作。
- 连接成功后输出一个用户真正想打开的 URL，比输出底层 endpoint/pairing file 更顺畅。
- VS Code 的常驻服务是其产品选择，不纳入 Yiru 当前范围。

### 2.3 Cloudflare Tunnel / cloudflared

Cloudflare 的 Web dashboard 先创建 tunnel，再根据 OS/架构展示可复制的 install-and-run 命令；
Linux/macOS 常见形式是：

```bash
sudo cloudflared service install <TUNNEL_TOKEN>
```

安装成功后 dashboard 自动从 pending 变成 healthy。`cloudflared` 建立纯出站 tunnel，不要求公网
IP、入站端口或 NAT 配置；每个 tunnel 默认维护四条到两个数据中心的长连接。来源：
[Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/setup/)、
[Cloudflare Tunnel architecture](https://developers.cloudflare.com/tunnel/)。

传输默认自动选择 QUIC；UDP 不通时降级到 HTTP/2/TCP。重试采用指数退避，文档给出的默认序列
是 1、2、4、8、16 秒。来源：
[cloudflared run parameters](https://developers.cloudflare.com/tunnel/advanced/run-parameters/)、
[Cloudflare Tunnel troubleshooting](https://developers.cloudflare.com/tunnel/troubleshooting/)。

Cloudflare 的 remotely-managed tunnel token 是长期 bearer：任何拿到 token 的人都可以运行该
tunnel。rotate 后旧 token 不能建立新连接，但已有连接仍存活，遇到泄露还要额外断开现有
connector。来源：
[Cloudflare tunnel tokens](https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens/)。

对 Yiru 的启示：

- Web 页面按 OS/架构给出精确命令，并实时显示 pending → connected，是最接近目标截图的 UX。
- 默认只依赖出站 443；重连、协议 fallback、健康状态不能交给用户处理。
- Cloudflare 的长期 token 命令适合运维，但不适合 Yiru 的个人终端历史；Yiru 应保留它的 UX，
  换成 single-use pair grant。

### 2.4 Tailscale

Tailscale 的 Linux 快速路径是：

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

首次 `tailscale up` 在终端输出一个登录 URL，浏览器确认后机器即进入 tailnet。来源：
[Tailscale Linux install](https://tailscale.com/download/linux/)、
[Tailscale login URL 示例](https://tailscale.com/learn/ssh-into-docker-container)。

自动化可以使用 `tailscale up --auth-key=...`。auth key 可配置为 one-off、reusable、ephemeral、
pre-approved 和 tagged；one-off key 在使用后自动撤销。但是撤销 enrollment key 不会撤销已经
注册的机器，删除 machine 才会让设备立即失去访问能力。来源：
[Tailscale auth keys](https://tailscale.com/docs/features/access-control/auth-keys)、
[Remove a device](https://tailscale.com/docs/features/access-control/device-management/how-to/remove-device)。

Tailscale 将 machine key 与 node key 分开：机器生成私钥，控制面只接收公钥；node key 可以轮换
和过期。官方也警告把 auth key 直接放在命令参数会进入 shell history，建议 one-off key 或通过
环境变量提供 reusable key。来源：
[Tailscale node keys](https://tailscale.com/docs/concepts/node-keys)、
[Securely handle an auth key](https://tailscale.com/docs/features/access-control/auth-keys/how-to/secure-auth-keys)。

网络层先使用 DERP relay 确保可达，再尝试升级到 P2P；所有路径都保持 WireGuard E2EE。来源：
[Tailscale connection types](https://tailscale.com/docs/reference/connection-types)。

对 Yiru 的启示：

- enrollment grant、机器身份、连接 session 是三种不同生命周期，必须分别撤销和轮换。
- Yiru 第一版不需要复制 Tailscale 的 NAT traversal；“出站 WSS 永远可用”比过早做 P2P 更重要。
- Web 的“删除机器”必须立即踢掉现有 socket，不能只让 pair code 失效。

### 2.5 ngrok Agent

ngrok 的 onboarding 是安装 CLI、从 dashboard 复制 authtoken、保存一次配置，然后运行极短的
业务命令：

```bash
ngrok config add-authtoken <TOKEN>
ngrok http 8080
```

`add-authtoken` 写入配置文件，因此以后不用重复 token；官方建议每个 agent 使用独立 authtoken，
以便缩小泄露范围并单独配置 ACL。来源：
[ngrok Agent CLI](https://ngrok.com/docs/agent/cli)、
[ngrok Agent](https://ngrok.com/docs/agent)。

ngrok agent 用一条出站 TLS/443 连接，不需要入站防火墙规则；生产部署用
`ngrok service install` / `start`，Linux、Windows、macOS 分别落到 systemd、Windows service 和
launchd，并使用系统日志。来源：
[ngrok Device Gateway quickstart](https://ngrok.com/docs/guides/device-gateway/quickstart)、
[ngrok Agent service docs](https://ngrok.com/docs/agent)。

对 Yiru 的启示：

- “设置一次，日常命令只有两个词”是正确目标。
- 独立 machine credential 值得直接采用；ngrok 的后台服务模式不纳入 Yiru 当前范围。
- 不采用 ngrok 的长期 authtoken copy/paste；它比一次性 exchange grant 更容易进入历史或截图。

### 2.6 Gitpod Runner

Gitpod 把 runner 视为只运行敏感工作负载的数据面，而把非敏感管理放在云控制面。Gitpod Desktop
会自动配置并启动本地 macOS runner，浏览器登录完成后返回桌面，之后 app 重启会自动恢复
runner。来源：[Gitpod Runners overview](https://www.gitpod.io/docs/gitpod/runners/overview)、
[Gitpod Desktop](https://www.gitpod.io/docs/flex/gitpod-desktop)。

其公开 API 的 `CreateRunner` 返回 runner 和 `exchangeToken`。旧的直接 `accessToken` 已废弃；
`exchangeToken` 是单次使用，runner 通过 `IdentityService.ExchangeToken` 换 access token，并在
24 小时后过期。来源：
[Gitpod Create Runner API](https://www.gitpod.io/docs/api-reference/resources/runners/methods/create/)。

对 Yiru 的启示：这是最接近目标流程的凭据模型。Web 创建 machine enrollment，命令只携带
exchange secret，本机兑换后拥有独立身份；Web 不需要把长期 runtime 凭据发给 shell。

## 3. 共同模式

| 问题 | 成熟产品的共同选择 | Yiru 应采用 |
| --- | --- | --- |
| 安装 | dashboard 按 OS/arch 显示包管理器或脚本 | 一行脚本为主，旁边提供“查看脚本”和包管理器选项 |
| 首次授权 | 浏览器授权或 Web 生成短期注册 token | 无账号、Web-first single-use `--pair`，双端核对短验证码 |
| 浏览器身份 | 多数产品使用账号 session | 不可导出的浏览器设备密钥，不使用登录 Cookie 作为机器权限 |
| 日常运行 | 凭据本地保存，命令不再带 secret | 同一已配对浏览器访问；机器端运行 `yiru connect` |
| 网络 | 主机主动建立出站加密长连接 | `wss://...:443`，不开放入站端口 |
| 恢复 | heartbeat + 有抖动的指数退避 + 服务监督 | 自动重连，终端沿用 epoch/snapshot recovery |
| 身份 | enrollment secret 与 device key 分离 | 本机生成 machine key；pair code 不成为长期 credential |
| 撤销 | token rotate、node delete、unregister 分层 | grant、浏览器授权、当前 session、machine identity 分层撤销 |
| 可观测性 | status、logs、dashboard online/last seen | CLI 与 Web 同时显示状态和可执行修复建议 |

## 4. 推荐的 Yiru 用户流程

### 4.1 Web-first：主路径

1. 用户打开 `https://app.yiru.ai`，无需登录。`https://yiru.ai/app` 只做跳转，不与营销站共享
   Workbench 的 origin 和浏览器密钥。
2. 浏览器使用 Web Crypto 生成不可导出的 ECDSA P-256 设备密钥，并把 `CryptoKey` 保存到
   IndexedDB；如果目标浏览器无法安全持久化该密钥则 fail closed，不退回 `localStorage` bearer。
3. Web 自动识别浏览器 OS，展示对应安装命令，并提供复制、查看脚本、包管理器三个入口。
4. Web 创建一个绑定 browser public key、10 分钟有效、单次兑换的 pairing grant，展示：

   ```bash
   yiru connect --pair yrp_<43-char-base64url>
   ```

5. CLI 在本机生成 machine ID 和 Ed25519 key pair，把 pair secret、public key、机器名、OS、架构和
   CLI 版本通过 HTTPS POST 发送给 enrollment API。
6. 服务端原子消费 grant，把 browser public key 与 machine public key 放进同一 pairing
   transcript。Web 和 CLI 显示由 transcript 派生的相同短验证码；CLI 要求用户确认一次，以阻断
   攻击者诱导用户运行属于另一个浏览器的配对命令。
7. 确认后，机器把 browser public key 写入本机授权记录；服务端保存双方公钥和授权关系。CLI
   立即清除内存中的 pair secret，任何一方都不保存它。
8. 浏览器和 CLI 分别签名 challenge，获得与各自公钥绑定的短时连接票据并建立出站 WSS。Web
   自动显示 `waiting → verifying → paired → online`，不要求用户再点“我已完成”。
9. Web 自动打开这台机器；终端显示机器名、Web URL 和“保持此终端运行”的简短提示。

再次访问时，浏览器用现有私钥签名 challenge，服务端只返回该 browser key 已获授权的机器。
如果 IndexedDB 中的私钥不存在，页面必须回到首次配对，不提供邮件、Cookie 或 URL 恢复。

### 4.2 CLI-first：后续可选能力

当本机没有 machine identity 时直接运行 `yiru connect`：

1. CLI 请求一个匿名、短期的 pairing session；这不是 OAuth 登录。
2. 能打开浏览器时，直接打开带预填 code 的 `https://app.yiru.ai/connect/<code>`。
3. headless/SSH 环境打印短 URL 与 human code；轮询频率、过期和 `slow_down` 语义参考 RFC 8628。
4. 新打开的浏览器仍然先创建 browser device key；页面与 CLI 显示同一个短验证码。
5. 用户确认后回到与 Web-first 相同的双设备公钥授权和 WSS 连接路径，不创建账号。

安全和交互语义参考：[RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)、
[RFC 9449 DPoP](https://www.rfc-editor.org/rfc/rfc9449)。Yiru 不把该流程描述成 OAuth，也不因此
引入账号或登录 session。

### 4.3 日常命令

建议命令面固定为：

```text
yiru connect                         前台连接；无身份时进入首次授权
yiru connect --pair <grant>          Web-first 首次配对并继续前台连接
yiru connect status                  本机身份和当前云连接状态
yiru connect access list             列出已授权浏览器
yiru connect access revoke <id>      撤销指定浏览器并立即断开其连接
yiru connect forget                  删除本机身份并请求服务端撤销机器
```

`yiru serve` 保留为本地/LAN/开发入口；`yiru connect` 专指主动连接 Yiru 云控制面。两者不应要求
用户理解 endpoint、port 或 relay 拓扑。

## 5. 推荐协议与安全模型

### 5.1 Enrollment grant

- 至少 256 bit CSPRNG entropy，base64url 编码；前缀 `yrp_` 只用于识别和日志脱敏。
- 10 分钟过期、单次兑换；服务端只保存 hash。
- 创建时绑定 browser public key、预期 capability scope 和临时 pairing session；兑换时再绑定
  machine public key。
- 只在 HTTPS request body 中兑换；不得放进 WebSocket URL、日志、错误、telemetry 或 crash dump。
- 接口必须原子 compare-and-consume；重复兑换统一返回 `expired_or_used`，避免泄露状态。
- Web 可主动 cancel，成功后立即消费；即使 shell history 保留也不能再次使用。

### 5.2 Browser identity

- 浏览器使用 Web Crypto 生成 `extractable: false` 的 ECDSA P-256 signing key；private `CryptoKey`
  只通过 structured clone 存入 IndexedDB，`localStorage` 只允许保存非秘密 UI 状态。
- 每次恢复机器目录、换取 WebSocket 票据或执行高权限连接操作都签名服务端 nonce；challenge 包含
  origin、purpose、machine、expiry 和唯一 nonce，防止跨接口重放。
- 连接票据短期、单次使用并绑定 browser key ID；即使页面存在普通 Cookie，它也不能单独列出或
  控制机器。
- browser key 不支持导出、同步或账号恢复。密钥丢失就是授权丢失，用户必须在机器端重新配对。
- 新浏览器必须成为新的授权主体；不能因为处在同一个 IP、设备名称相同或持有旧 URL 而继承权限。

### 5.3 Machine identity

- CLI 本机生成 Ed25519 identity key；服务端只保存 public key。
- private key 与普通设置分开。macOS/Windows 优先 OS keychain；headless Linux 使用
  owner-only `0600` 文件，并在 TPM/Secret Service 可用时加密。keyring 超时必须是可诊断错误。
- 不把长期 bearer 放进 argv、环境变量、URL 或普通 JSON 配置。
- 每次建立云连接先完成 challenge/signature，再签发单次使用、短时有效的 connection ticket；
  ticket 绑定 machine public key，采用与 RFC 9449 DPoP 相同的 sender-constrained 原则，但不是
  OAuth access token。
- 机器本地保存已授权 browser public key 列表，并在建立 E2EE session 前验证浏览器身份；云端
  machine directory 不能单方面把一个新浏览器变成已授权设备。
- 机器身份 key、E2EE handshake key 和 terminal epoch key 分离，避免一个密钥承担所有角色。

### 5.4 连接与 relay

- host 只主动连接 `wss://connect.yiru.ai` 的 443；第一版不做公网监听或 P2P。
- control 与 terminal bulk 保持独立 WebSocket，延续现有 terminal multiplex 的优先级和流控。
- 浏览器 WebSocket 不能设置自定义认证 header，因此 upgrade 只创建无权限 socket；relay 发 nonce，
  客户端在第一条 auth frame 中提交一次性 ticket 和设备签名，验证前拒绝所有业务 frame。ticket
  不得进入 query string、Cookie 或 `Sec-WebSocket-Protocol`。
- relay 只看 browser-key-id/machine/session/lane 等路由 metadata；业务 frame 保持现有 AEAD，
  relay 转发 opaque bytes。现有约束见 [terminal multiplex 规格](./terminal-multiplex.md)。
- E2EE handshake transcript 绑定已授权 browser key、machine key、双方 ephemeral key 和 session
  nonce；即使 relay 或 directory 被篡改，机器也不接受一个未在本机授权记录中的 browser key。
- RFC 6455 ping/pong 检测断线；应用 heartbeat 负责 online/last-seen 与 generation。来源：
  [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455)。
- reconnect 使用 full-jitter exponential backoff，例如 0.5s → 1s → 2s → 4s → 8s → 15s，
  成功稳定一段时间后重置；认证失败不无限重试，直接提示 re-pair/revoke 状态。
- 重连重新完成双方 key proof 并生成新 epoch，terminal 继续使用 authoritative snapshot recovery，
  不另造 replay 语义。

### 5.5 Revocation 与轮换

- **Cancel grant**：只让尚未兑换的 pair code 失效。
- **Revoke browser**：机器本地授权记录和云 directory 同时删除 browser key，立即关闭该浏览器的
  所有 socket，并拒绝旧 ticket 和重连。
- **Disconnect session**：关闭当前 host/browser sockets，不改变 browser-machine 授权关系。
- **Forget machine**：撤销 machine key、关闭全部 socket，并清除该机器与所有浏览器的关系。
- **Rotate identity**：在线机器以旧 key 签名新 public key；旧 key 在确认新连接后失效。
- Web 只能撤销当前 browser key 自己的权限；列出并撤销其他浏览器必须从机器 CLI 执行，避免一个
  被盗浏览器成为全部授权的管理员。
- `yiru connect forget` 先请求服务端 revoke，再删除本机 private key；离线时记录 pending revoke，
  并清除本机 browser allowlist。

### 5.6 Web origin 与 XSS 闸门

无登录方案最大的浏览器风险不是密钥被导出，而是同源恶意脚本借用不可导出私钥发起合法签名。
因此以下是上线硬条件：

- Workbench 使用独立 `https://app.yiru.ai` origin；营销站、文档、用户内容和 Workbench 不共享
  IndexedDB、Service Worker 或脚本执行上下文。
- Workbench 不加载 tag manager、广告、客服挂件或第三方 analytics JavaScript；遥测从应用自己的
  后端接收经过白名单的事件，不让第三方脚本进入 origin。
- script CSP 禁止 `unsafe-inline`、`unsafe-eval` 和非白名单脚本，启用 Trusted Types、
  `frame-ancestors 'none'`、`Referrer-Policy: no-referrer` 和严格 Permissions Policy。Workbench
  的既有布局会通过 React 写入动态 style attribute，因此 `style-src-attr 'unsafe-inline'` 暂时保留；
  它不放宽 `script-src`，且不得扩展到 `<style>`、外部 style origin 或 HTML 字符串注入。
- 第一版不注册 Service Worker，避免一次脚本供应链事件形成长期持久化控制；以后若需要离线能力，
  必须单独设计更新完整性和强制撤销。
- pairing grant、challenge、ticket、terminal frame 和错误内容都不得进入 URL、browser history、
  analytics、日志或 crash report。
- 发布闸门必须包含构建产物审计和真实 XSS/重放/撤销演练；任何安全能力不可用时 fail closed，
  不能降级为 localStorage bearer 或“只校验 machine ID”。

该模型保护 relay/database 泄露、配对码过期后泄露、URL 猜测和网络中间人；它不声称保护已被
恶意软件控制的机器、已被他人解锁的浏览器 profile、被攻破的 Workbench origin，或用户忽略短
验证码警告后的社交工程。登录同样不能消除这些端点风险。

## 6. 技术选型

### 6.1 复用现有 TypeScript 依赖，不重写 CLI

Yiru 已有自有 CLI spec/parser、`undici`、`ws`、`zod`、`tweetnacl`、oRPC 和 terminal multiplex。
第一版无需引入 Commander、OAuth framework、Socket.IO 或 QUIC：

| 能力 | 建议 |
| --- | --- |
| CLI 语法 | 扩展现有 command spec/parser，保持帮助、JSON 输出与错误格式一致 |
| HTTPS enrollment | 现有 `undici` |
| host WebSocket | 现有 `ws`；显式 heartbeat、frame cap、backpressure 和 reconnect state machine |
| schema | `zod` 只放在网络边界；协议类型放 `packages/runtime-protocol` |
| browser identity | 原生 Web Crypto ECDSA P-256 + IndexedDB `CryptoKey`，不引入账号 SDK |
| machine key | Node `crypto` 的 Ed25519；现有 `tweetnacl` 继续负责跨端 E2EE，不混用职责 |
| control RPC | 延续 oRPC；pair/exchange 是云控制面 API，不伪装成本地 preload capability |

如果未来把 standalone connector 拆成原生二进制，VS Code 已验证的 Rust 组合
`clap + reqwest + tokio + tokio-tungstenite + keyring` 是合理参考；当前没有足够收益支撑先重写。

### 6.2 发布产物：先复用已签名的 Yiru runtime

不让安装脚本先安装 Node。第一版 macOS/Linux 安装器复用现有按 OS/架构构建的完整发行包，从中
安装同一套 TypeScript CLI/runtime-host、固定版本 Electron Node runtime 和匹配 ABI 的
`node-pty`。每个包必须有 GitHub Actions OIDC 签发的 provenance；macOS 还验证 Developer ID 与
公证。安装器把版本原子切换到 `yiru` launcher，失败时保留旧版本。

Node SEA 可以作为后续收敛成单文件的选项，但当前 Node 22 的 SEA 仍是 active development，且
native addon 需要提取后用 `process.dlopen()` 加载；对 `node-pty` 而言并没有消除按平台构建与签名
的复杂度。来源：[Node.js Single executable applications](https://nodejs.org/download/release/latest-v22.x/docs/api/single-executable-applications.html)。

### 6.3 云端：Cloudflare Worker + 每 machine 一个 Durable Object 的 MVP

当前 `yiru.ai` 已由 Cloudflare Worker/Wrangler 部署。MVP 可让独立 Workbench Worker 负责匿名
browser-key challenge、grant API、key-bound connection ticket 和 WebSocket upgrade，并以 machine
ID 路由到一个 Durable Object：

- 一个 object 协调同一机器的 host control/bulk socket 与一个或多个 browser socket。
- Hibernation WebSocket API 让空闲连接保持在线而 object 可休眠；attachment 保存 socket role、
  browser key ID、machine、lane、generation 等可恢复 metadata。
- binary frame 原样转发；小 control message 可批量，terminal frame 不解析、不改写。
- 部署会断开现有 WebSocket，因此 host/browser 必须把 deploy 当普通 reconnect 处理。

Cloudflare 官方说明 Durable Objects 是多 WebSocket 的 single point of coordination，推荐扩展的
Hibernation API，并建议批量小消息降低 per-message 开销。来源：
[Workers WebSockets](https://developers.cloudflare.com/workers/runtime-apis/websockets/)、
[Durable Objects WebSocket best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)。

这只是 MVP 选择，不应未经压测直接承诺为最终 terminal data plane。terminal bulk 的并发、
消息频率、持续吞吐、计费和跨区域延迟达到阈值后，再把 bulk lane 迁到专用 relay；control API
和 enrollment contract 保持不变。Durable Objects 的收到消息上限是 32 MiB，WebSocket 入站消息
参与 request 计费；Hibernation 能降低空闲时长费用，但高频 terminal 数据仍会唤醒对象，所以压测
必须同时记录 p95 延迟、吞吐、CPU 与每活跃机器成本。来源：
[Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)、
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)。

## 7. Web onboarding 细节

Web 页面建议只有三步，并且每一步都由服务端状态自动完成：

1. **安装 Yiru**：OS tabs、复制按钮、`yiru --version` 自检、查看脚本链接。
2. **连接这台电脑**：创建 grant 并显示唯一一行 `yiru connect --pair ...`；倒计时和重新生成。
3. **已连接**：显示机器名/OS/version，自动进入 workbench。

流畅度要求：

- page load 时才创建 grant，离开页面/cancel 时撤销；不要在静态 HTML 中预埋 secret。
- 首次进入先在专用 Workbench origin 创建 browser key；返回用户先签名 challenge，再加载被该
  public key 授权的机器，不出现登录页。
- command 复制后显示“已复制”，但页面依然等待服务端事件，不要求用户点击“我已运行”。
- CLI 输出与 Web 使用相同的阶段名：Installing / Pairing / Verify code / Connecting / Online。
- CLI 和 Web 同时突出显示短验证码；只有 CLI 需要一次确认，Web 不再增加第二个确认按钮。
- 常见失败直接给动作：`command not found` → PATH 修复；`pair expired` → 页面自动刷新命令；
  `proxy/TLS` → `yiru connect diagnose`；`already paired` → 直接 `yiru connect`。
- 配对成功后地址栏、浏览器 history、analytics 全部不含 grant。当前 Web pairing 会把完整 runtime
  credential 导入浏览器 local storage；云模式必须删除该做法，授权来自 IndexedDB 中不可导出的
  browser private key，`localStorage` 只记非秘密 machine selection。
- 页面明确提示“此浏览器已获授权”；清除数据或换浏览器需要重新配对，不承诺账号恢复。
- install script 必须可查看，检测 OS/arch，解析最新发布后锁定其不可变 tag URL，校验 digest 与
  GitHub build provenance 后原子替换；也提供 Homebrew/apt 等用户可审计的替代入口。

## 8. 实施计划

### Phase 0：冻结无账号安全契约

产出：browser/machine/grant/ticket/session 术语、状态机、threat model、撤销语义和协议 schema。

完成标准：

- 明确当前版本没有登录、账号同步或账号恢复；browser key 是 Web 机器权限的唯一持久主体。
- 明确 `yiru serve` 与 `yiru connect` 的边界，以及 CLI 退出即离线的生命周期。
- browser private key、machine private key、grant、connection ticket 和 E2EE session key 在 contract
  中不可互换。
- 冻结 P-256 browser key、Ed25519 machine key、短验证码 transcript 和本机 browser allowlist。
- 冻结发行包内 CLI/runtime-host 的内容、安装位置、provenance、升级/回滚和 `node-pty` 平台矩阵。

### Phase 1：隔离 Workbench origin 与浏览器身份

建立 `app.yiru.ai` 独立部署边界，实现 Web Crypto 非导出 key、IndexedDB 持久化、challenge signing
和 returning-browser 恢复；移除 Workbench 中的第三方脚本与 credential `localStorage`。

完成标准：刷新和重新打开同一 browser profile 后仍能证明同一身份；无痕/清除数据后无法恢复旧
授权；CSP、Trusted Types、frame/referrer/permissions headers fail closed；`yiru.ai/app` 只跳转。

### Phase 2：匿名 enrollment 与 key directory

在独立 Worker connect feature 中实现 browser challenge、grant create/cancel/exchange、双公钥
pairing transcript、key-bound one-time connection ticket、授权机器目录和 online/last-seen 事件。

完成标准：grant 绑定 browser key、10 分钟单次使用且并发兑换只有一个成功；没有 browser 签名就
不能列出机器或换 ticket；服务端持久数据不含私钥、长期 bearer 或终端明文。

### Phase 3：`yiru connect`、短码确认与机器授权

在 CLI connect feature 中实现 `--pair` exchange、machine identity store、短验证码确认、browser
allowlist、foreground connection、status、access list/revoke、forget 和结构化 `--json` 输出。

完成标准：新机器一行命令加一次短码确认在线；第二次只需 `yiru connect`；pair code 不写磁盘且
不进入错误/日志；机器拒绝未在本机 allowlist 的 browser key；revoke 立即终止对应连接。

### Phase 4：cloud relay 与 E2EE 身份绑定

把现有 runtime control 和 terminal bulk 两条 lane 接到相同 machine session；E2EE transcript 绑定
双方长期身份、ephemeral key 和 session nonce，relay 只转发 opaque inner frame。

完成标准：篡改 directory 或 ticket 不能让新 browser 绕过机器 allowlist；浏览器在不同网络无需
端口映射即可操作 repo、agent、文件和 terminal；断网/IP 切换/Worker deploy 后重新 proof 并恢复；
control 不被 terminal flood 饿死。

### Phase 5：无登录 Web 三步引导

把当前“粘贴 pairing URL/runtime credential”页替换为安装、配对、连接状态流；实现首次 browser、
returning browser、offline machine、grant expiry、短码核对和“撤销当前浏览器”界面。

完成标准：页面没有登录入口；用户只复制安装与首次 connect 两条命令，不复制 endpoint、pairing
file 或 API key；CLI online 后 Web 自动进入机器；清除 browser data 后明确要求重新配对。

### Phase 6：installer 与受验证的发布产物

发布 macOS/Linux install script，复用已签名的发行包；独立 headless artifact 与 Windows 安装器
在对应平台正式开放前补齐。`yiru connect` 始终以前台进程运行，并使用执行配对的同一用户身份
访问 repo、SSH key 和 agent 凭据。

完成标准：脚本幂等升级、校验签名、失败不破坏旧版本；uninstall 不误删用户 repo；同一机器重复
运行 `yiru connect` 时有明确的 singleton/ownership 行为。

### Phase 7：安全闸门、真实流程验证与分批发布

实现 grant/IP 限速、重放防护、ticket 单次消费、browser/machine key rotation、即时 socket revoke、
版本/capability gate、relay backpressure、secret redaction 和发布产物审计。

遵循仓库规则，不增加测试文件；使用 build、typecheck、lint、repository contracts 和真实 app/CLI
流程验证。真实安全演练覆盖 grant 重放、错误短码、伪造 browser key、撤销后重连、relay 篡改、
XSS 注入、浏览器数据清除、代理网络、断网恢复、terminal 长流和多浏览器竞争。

发布顺序：内部浏览器设备 → opt-in canary → 小比例 Web 用户 → 默认开放。任一场景出现 bearer
fallback、未授权连接、relay 明文或撤销后可重连，都停止发布。

## 9. 不建议做的事

- 不把长期 `--api-key`、runtime token 或 refresh token 放进复制命令。
- 不让安装脚本静默配对、创建后台进程或修改系统启动项。
- 不要求最终用户理解 `ws://127.0.0.1:6768`、pairing file、端口转发或 mixed content。
- 不把完整 runtime credential 存进 Web local storage；Web 权限只来自 browser private key 和机器
  allowlist。
- 不为第一版加入登录、账号恢复、QUIC、P2P 或 OAuth；先让无账号设备认证、出站 WSS/443、撤销
  和自动重连可靠。
- 不把 `connect` 变成另一个产品名或另装一个 `yiru-computer`；一个 `yiru` binary 足够。

## 10. 首个可交付里程碑

第一个真正可交付版本应只承诺下面这条纵向链路：

```text
app.yiru.ai 生成不可导出的 browser key，并创建与其绑定的 single-use grant
  → 用户执行 yiru connect --pair ...
  → CLI 生成 machine key，双方显示同一短验证码
  → 用户确认，机器保存 browser public key
  → 双方 proof-of-possession 后建立 outbound WSS 和 E2EE session
  → Web 自动看到 online
  → 用户打开一个 repo、启动 agent、使用 terminal
  → CLI revoke browser 后 socket 立即断开且不能重连
```

先把这条链路做到跨网络、可撤销、断线可恢复、无长期命令行 secret，并证明清除 browser key 后
只能重新配对，再增加 CLI-first pairing 和多机器管理。这样每一个阶段都有完整用户价值，同时不会
把未经验证的 relay、安装与身份方案一次性耦合。
