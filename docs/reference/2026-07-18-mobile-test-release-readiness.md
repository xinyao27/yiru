# Yiru Mobile test 发布就绪度调查(2026-07-18)

调查目标:确认在本仓库(`xinyao27/yiru`)发布手机端 test 版本需要什么、当前还缺什么。
范围:iOS TestFlight、Android 测试分发、以及 app 依赖的 relay/test 后端。
所有结论基于仓库源码、GitHub Actions 配置、`gh` API 只读查询和官方文档;未执行任何真实发布。

## TL;DR

- **发布通道的代码已经存在**:iOS 走 fastlane → TestFlight(`.github/workflows/mobile-ios-release.yml`),Android 走 Gradle APK → GitHub Release(`.github/workflows/mobile-android-release.yml`)。**没有 EAS、没有 Google Play 集成**;Android 当前只是 GitHub Releases APK 旁加载。
- **E2EE 发布阻塞已在本分支修复**:品牌重命名不再改变已发布的 `orca-mobile-e2ee` cryptographic wire domain;mobile 完整 suite 283/283 文件通过(2013 passed,2 skipped),桌面 E2EE focused suite 也通过。发布 workflow 仍应补 preflight,避免未来绕过红灯。
- **iOS 平台配置已于 2026-07-18 完成**:6 个 GitHub Secrets、App ID/Push、ASC app/API key、有效 Distribution identity、`Yiru Internal` 自动分发组和 1 名测试员均已验证。本分支同时完成代码绿灯和 0.0.1;现在只缺 PR 合入后的第一次 workflow 演练。
- **Android 构建链可用但分发身份不合格**:本地 `assembleRelease` 已成功产出 120 MB APK,但它由公开的 `Android Debug` key 签名。最小范围旁加载测试可用;公开/可信分发或未来上 Play 前必须配置专用 release/upload key。本分支已准备 0.0.1/versionCode 1。
- **两个发布工作流在本仓库从未运行过**(`gh run list` 均为空;`mobile-*-v0.0.27` 等 tag 来自迁移前历史)。迁移后的凭据、签名和上传路径尚无一次端到端证据。
- **LAN 测试不需要云后端**,但默认远程 relay 当前明确不可用:2026-07-18 经 1.1.1.1、Cloudflare DoH 和 Google DNS 查询,`login.yiru.ai` 与 `relay.yiru.ai` 都返回 **NXDOMAIN**;服务端代码也不在本仓库。
- 当前也**没有独立的 test flavor/environment**:TestFlight internal 与 Android APK 都使用正式包标识 `com.xinyao27.yiru.mobile`,没有 `.test` bundle/package、独立图标、独立配置或共存安装能力。若“test 环境”只指测试分发渠道,这不是问题;若要求与生产隔离,则仍需设计实现。

## 发布架构现状(代码内已具备)

### iOS — TestFlight

- 工作流 `.github/workflows/mobile-ios-release.yml`:tag `mobile-ios-v*` 或 `workflow_dispatch` 触发;`macos-26` runner + Xcode 26.5(镜像已含 26.5 且为默认,2026-07-18 经 [runner-images macos-26 readme](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md) 验证);仓库为 public,GitHub 托管 macOS runner 免费。
- 凭据预检:`mobile/scripts/verify-ios-testflight-env.mjs` 在装依赖前快速失败,要求 6 个 env:`APPLE_TEAM_ID`、`ASC_KEY_ID`、`ASC_ISSUER_ID`、`ASC_API_KEY_P8`、`IOS_DIST_CERT_P12`、`IOS_DIST_CERT_PASSWORD`。本地干跑确认其行为正确(缺失时 exit 1 并列出全部缺项)。
- fastlane(`mobile/fastlane/Fastfile`;`Gemfile` 声明 fastlane,但当前没有版本约束或 `Gemfile.lock`):
  - `prepare_release_version`:从 `app.json` 解析版本(支持 dispatch 输入 `release_version`/`bump_patch_version`),用 ASC API 查 `latest_testflight_build_number` 自增 buildNumber,并有 closed-train(altool 90186)快速失败守卫。
  - `release`:`get_provisioning_profile`(sigh,API key)拉取/创建 App Store profile → 手动签名 archive/export(导入的 Apple Distribution .p12 + 临时 keychain,不依赖 cloud signing)→ `upload_to_testflight`。internal 默认(上传即完成,靠 ASC internal 组自动分发);external 走 `peeps` 组 + changelog + 等待处理,首个 build 需 Beta App Review。
  - `.ipa` 始终作为 artifact 上传(`if: always()`)。
- `mobile/app.json`:权限文案、ATS 局域网例外、privacy manifests、`ITSAppUsesNonExemptEncryption: false` 均已配置(免加密合规问卷)。

### Android — APK / GitHub Release(无 Play Console)

- 工作流 `.github/workflows/mobile-android-release.yml`:tag `mobile-android-v*` 或 dispatch;`ubuntu-latest` + JDK 17;`expo prebuild` → `./gradlew assembleRelease` → APK artifact + `gh release create`(prerelease,`--latest=false`)。只需 `GITHUB_TOKEN`(`contents: write` 已声明),**无外部 secret**。
- `mobile/scripts/prepare-android-release.mjs`:强制 tag/输入版本与已提交的 `app.json` 一致、禁止 CI 私自 bump versionCode(必须先提交)。本分支干跑通过:`Prepared Yiru Mobile Android 0.0.1 (1)`。
- **签名方式:debug keystore**。`expo prebuild` 模板生成的 `android/app/build.gradle` 中 release buildType 是 `signingConfig signingConfigs.debug`(本地 prebuild 产物第 112–115 行证实,含模板自带的 "In production, you need to generate your own keystore" 注释,见 [React Native signed-apk 文档](https://reactnative.dev/docs/signed-apk-android))。本地 JDK 17 `./gradlew assembleRelease` 实际构建成功;`apksigner verify --print-certs` 确认 signer DN 为 `CN=Android Debug`。对受控旁加载测试可安装,但公开 key 无发布者防伪能力,也不是 Play 发布方案。
- 根 README 已声明分发口径:"New mobile builds will be announced on GitHub Releases"(`README.md:212`)。

### 明确不存在的东西(辨析,非缺口)

- **无 EAS**:`mobile/package.json` 无 `expo-updates`,`app.json` 无 `extra.eas.projectId`,仓库无 `eas.json`。发布完全由本仓库 CI(fastlane/Gradle)承担,不经 EAS Build/Submit/Update,也没有 OTA 更新通道。
- **无 Google Play 集成**:无 AAB 构建、无 `supply`/Play 上传 lane、无 service account secret。
- **无远程 push 服务配置**:`expo-notifications` 在业务代码中仅调度本地通知,没有 push token 获取,仓库也无 `google-services.json`。但 Expo prebuild 仍会带入 Android notification/FCM 相关 manifest 权限并生成 iOS `aps-environment` entitlement;这也是 Apple App ID capability 必须实签确认的原因。

### CI 质量门(配置存在,本分支已恢复为绿)

`.github/workflows/mobile.yml` 对 `mobile/**` 的 PR 跑 typecheck / vitest / oxlint / oxfmt,但发布工作流本身不重复跑这些检查。2026-07-18 本分支复核结果:

- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`:通过。
- 两个 release contract test 文件:9/9 通过。
- 完整 mobile suite:283/283 test files 通过;2013 passed,2 skipped。
- 桌面 E2EE/relay focused suite:通过;`pnpm typecheck:node` 通过。
- Android release resolver 输出 `Yiru Mobile Android 0.0.1 (1)`和 tag `mobile-android-v0.0.1`。

根因是品牌重命名把已发布的 E2EE transcript/HKDF domain 从 `orca-mobile-e2ee` 改成 `yiru-mobile-e2ee`。这些值是经过认证的 wire identifiers,不是可改品牌文案;本分支恢复 legacy domain 并用既有 normative vectors 锁定兼容性。PR #1 曾在 Mobile Checks/PR Checks 失败后仍被合并,且 `main` 没有 required status checks,所以 release workflow 增加或依赖 preflight 仍是后续增强项。

## 后端:relay / test 环境辨析

手机 app 是**后端无关**的:所有连接信息(endpoint、deviceToken、公钥、relay 参数)来自桌面生成的配对二维码/凭据,**不在构建期烘焙任何 URL**(`mobile/src` 中无 `EXPO_PUBLIC_*`,仅测试用 env)。测试一个手机 build 有三条路径:

1. **LAN 直连(默认测试路径,零外部依赖)**:桌面 Yiru 在 6768 端口开 mobile WebSocket RPC 服务;手机与桌面同 LAN,扫码配对(`mobile/README.md`)。Android 模拟器用 `ws://10.0.2.2:6768`。
2. **Mock server(无桌面)**:`cd mobile && pnpm mock-server`,endpoint `ws://localhost:6768`,token `mock-device-token`。
3. **Relay(远程/非同网)**:桌面登录 Yiru Cloud → `POST <login>/v1/desktop/auth/relay-token` 换 relay token → `POST <director>/v1/assign` 取 cell(`src/main/runtime/relay/relay-http-client.ts:87-90`)→ 配对 offer/凭据把 `directorUrl`/`cellUrl` 传给手机。

Relay 的关键事实:

- 生产默认:director `https://relay.yiru.ai`、auth `https://login.yiru.ai`,硬编码在 `src/main/yiru-profiles/profile-cloud-auth-config.ts:19-21`。
- **服务端(director/cell/Yiru Cloud auth)代码不在本仓库**(仓库内只有客户端与 zod 契约;无 wrangler/服务器实现)。注意 `src/relay/` 是另一码事:SSH/远端主机上的 Yiru relay 守护进程,与移动 relay 无关。
- **默认域名当前未部署到 DNS**:2026-07-18 查询 `login.yiru.ai` 和 `relay.yiru.ai` 均为 NXDOMAIN(Cloudflare 权威 SOA;Cloudflare/Google 公共解析器结果一致)。所以默认 remote relay/cloud sign-in 路径当前确定不可用,不是“尚无法验证”。后续即使 DNS 上线,仍需用真实账号做 auth → relay-token → assign → phone connect 端到端验证。
- **test 环境覆盖点全在桌面侧 env**:`YIRU_RELAY_URL`(必须 canonical origin;打包版仅 https,dev 版允许 loopback http)、`YIRU_CLOUD_API_URL`、`YIRU_CLOUD_CLIENT_ID` 及各 endpoint 覆盖(`profile-cloud-auth-config.ts:75-123`)。dev(未打包)桌面若不设 `YIRU_CLOUD_API_URL`+`YIRU_CLOUD_CLIENT_ID`,cloud 登录整体不可用 → relay 不可用,但 **LAN 配对完全不受影响**。
- **手机侧强制 HTTPS**:配对 offer 与凭据契约都要求 `directorUrl`/`cellUrl` 是 canonical HTTPS origin,无 loopback 例外(`src/shared/mobile-relay-pairing-offer.ts:10-20,37-41`、`src/shared/mobile-relay-credential-contract.ts:8-15`)。⇒ 要让真机走 test relay,该 relay 必须有真实可信 TLS 证书;`http://localhost` 只能用于桌面侧单元/集成测试(desktop 侧 `isAllowedRelayOrigin` 允许 loopback http,`relay-http-client.ts:43-54`)。
- 协议兼容握手与 `ProtocolBlockScreen` 已存在;本分支保留已发布的 E2EE wire domain,避免品牌重命名绕过兼容握手直接破坏旧客户端。

### “测试渠道”与“独立 test 环境”不是一回事

当前仓库只实现了测试**渠道**:同一个 iOS bundle ID 进入 TestFlight internal,同一个 Android package 产出 prerelease APK。app 没有 build-time backend URL,运行时连接目标来自桌面二维码。因此:

- 只需给内部人员试用当前版本:沿用正式 bundle/package 是正常做法。
- 需要 test/prod 同时安装、使用不同商店记录、不同 deep-link scheme 或明确视觉区分:缺少 Expo dynamic config/build profile、`.test` 标识、独立签名/ASC app、图标/名称和 CI matrix。
- 需要连 test relay:不必 fork mobile app,应先部署带可信 HTTPS 的 test auth/director/cell,再让 test desktop 通过 `YIRU_CLOUD_*`/`YIRU_RELAY_URL` 生成包含 test relay endpoint 的二维码。

## 分类清单

### A. 代码中已具备(已验证)

- [x] iOS TestFlight 完整流水线(workflow + fastlane + 预检 + 版本/close-train 守卫)
- [x] Android APK → GitHub Release 完整流水线(无 secret 依赖)
- [x] 双工作流解耦触发(tag `mobile-ios-v*` / `mobile-android-v*` + dispatch)
- [x] PR 质量门 workflow 已定义(`mobile.yml`),但当前 suite 未通过
- [x] app.json 权限/隐私/ATS/加密合规配置;品牌与 bundle ID 已迁移为 `com.xinyao27.yiru.mobile`
- [x] LAN 直连 + mock server 测试后端;desktop 侧 relay/cloud env 覆盖机制
- [x] runner 前提成立:`macos-26` 镜像 GA 且含默认 Xcode 26.5;仓库 public,Actions 免费;根 `package.json` 有 `packageManager: pnpm@10.24.0`(`pnpm/action-setup` 依赖它)

### B. 必须由平台管理员外部完成、无法仅从 repo 验证

- [x] Apple Developer Portal App ID `com.xinyao27.yiru.mobile` 已注册,Push Notifications capability 已启用
- [x] App Store Connect app `Yiru` 已创建并绑定正确 bundle ID;API 读取验证通过
- [x] ASC API Key(App Manager)和 Apple Distribution `.p12` 已创建;证书/私钥匹配并且证书在 Apple API 中为有效 `DISTRIBUTION`
- [x] TestFlight internal 组 `Yiru Internal` 已创建,`hasAccessToAllBuilds` 已开启,1 名内部测试员已加入;若用 external,还需建名为 `peeps` 的组(`Fastfile:30` 硬编码),且首个 build 需过 Beta App Review
- [ ] 部署并运维 `relay.yiru.ai` / `login.yiru.ai` 对应 auth/director/cell 服务,再做新账号端到端验证——当前 DNS 为 NXDOMAIN;仅影响远程 relay,不影响 LAN 测试
- [x] `APPLE_TEAM_ID` 已按 distribution certificate 所属团队重设;`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`MAC_CERTS*` 仍仅供桌面 mac 发布使用

### C. 明确缺失 / 阻塞(已验证)

- [x] **E2EE normative contract 已修复**:保留已发布 legacy wire domain;mobile 全套测试、桌面 focused tests 和 node typecheck 均通过
- [x] **6 个 iOS secrets 已全部配置**:`APPLE_TEAM_ID`、`ASC_KEY_ID`、`ASC_ISSUER_ID`、`ASC_API_KEY_P8`、`IOS_DIST_CERT_P12`、`IOS_DIST_CERT_PASSWORD`
- [x] **Apple 新 app identity 已验证**:App ID、Push capability、ASC app record、API key 和有效 distribution certificate/private key 均存在;provisioning profile 留给 fastlane 首跑创建
- [x] **首个 mobile 版本已准备为 0.0.1 / versionCode 1**;Android resolver 生成 `mobile-android-v0.0.1`
- [ ] **默认远程云路径 DNS 不存在**:`login.yiru.ai`、`relay.yiru.ai` 均 NXDOMAIN;若本轮只验 LAN,可明确接受这个范围削减
- [ ] **两个发布工作流在本仓库零运行记录**→ 迁移后未演练过,首跑属于未验证路径

### D. 可选增强(非阻塞)

- [ ] Android 专用 release keystore(secrets + Gradle signing 注入):受控短期旁加载可暂缓;只要 APK 面向更广人群公开,就应视为安全必需项。未来 Play 内测还需 AAB、Play Console app、Play App Signing/upload key 和上传集成
- [ ] iOS tag 触发不校验 tag 版本与 `app.json` 一致(Android 侧脚本校验)→ tag 名与实际上传版本可能漂移
- [ ] `mobile/Gemfile` 注释指向已不存在的 `.github/workflows/mobile-build.yml`,且虽然注释声称 pin fastlane,实际没有版本约束/`Gemfile.lock`;应锁定 release toolchain
- [ ] 移动 relay 路径缺 CI 级 e2e(现有 `mobile-relay-e2ee.integration.test.ts` 为桌面侧模拟对端)
- [ ] 若产品要求真正独立 test 环境,新增 `.test` bundle/package、独立 app records/signing、build profile、名称/图标/scheme 与 CI matrix
- [ ] 将 mobile checks 设为 required,或让两个 release workflow 显式依赖同一套 typecheck/test/lint/format preflight

## 可执行 checklist(建议顺序)

**Android test 发布(最短路径,预计一次 PR + 一次 dispatch):**

1. [已完成] 保留 legacy E2EE wire domain并跑绿完整 mobile checks。
2. [已完成] `mobile/app.json`/`mobile/package.json` 已准备 0.0.1;全新 package 保留 versionCode 1。
3. `workflow_dispatch` **Mobile Android Release**(`publish_github_release: true`,默认)或推匹配 tag。
4. 验证:GitHub Releases 出现预期 prerelease + APK;用干净真机和覆盖升级各测一次,与同 commit 桌面 LAN 配对走通。

**iOS TestFlight 发布:**

1. [已完成] E2EE/完整 checks 绿灯和 0.0.1 版本提交内容已准备。
2. [已完成] Apple 侧 App ID/capability、ASC app/API key、Distribution `.p12` 和全部 GitHub Secrets。
3. [已完成] TestFlight internal group `Yiru Internal`、全部构建自动访问和内部测试员已配置。
4. `workflow_dispatch` **Mobile iOS Release**,`testflight_distribution: internal`(默认,安全)。
5. 首次成功上传并处理完成后,在 ASC 给 internal 组开自动分发并加测试员;用真机验证安装、启动、通知权限、LAN 配对和重连。
6. 需要外部测试者时:ASC 建 `peeps` 组 → dispatch 时选 `external` 并填 changelog → 等首个 build 过 Beta App Review。

**test 后端:**

1. LAN 测试:仓库根 `pnpm dev` 起桌面(`lsof -nP -iTCP:6768 -sTCP:LISTEN` 确认),手机扫码配对——不需要任何云端。
2. 无桌面 UI 冒烟:`cd mobile && pnpm mock-server`(token `mock-device-token`)。模拟器可用 localhost/`10.0.2.2`;真机仍需电脑 LAN 地址,不能把手机自己的 localhost 当开发机。
3. 远程 relay 测试(可选):先修复当前 NXDOMAIN 并部署默认服务;或在 dev 桌面用 `YIRU_CLOUD_API_URL`/`YIRU_CLOUD_CLIENT_ID`/`YIRU_RELAY_URL` 指向 test 实例——注意手机侧要求 relay URL 为有效 HTTPS canonical origin。

## 证据

| 结论                                      | 证据                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| iOS 流水线存在且预检 6 secrets            | `.github/workflows/mobile-ios-release.yml:60-70`;`mobile/scripts/verify-ios-testflight-env.mjs:5-12`                                                                           |
| 本地干跑预检:缺失时列出全部 6 项并 exit 1 | `node scripts/verify-ios-testflight-env.mjs` → `Missing iOS TestFlight credentials: APPLE_TEAM_ID, ASC_KEY_ID, ...`(exit 1)                                                    |
| 6 个 iOS Secrets 已配置                   | `gh secret list --repo xinyao27/yiru` 显示全部必需名称;secret 内容不回显                                                                                                       |
| Apple app/signing identity 可用           | ASC API 成功读取正确 app/bundle ID;Developer API 确认 Push capability 与有效 `DISTRIBUTION` certificate;新 P12 经临时 keychain `security import` 验证包含 identity/private key |
| bundle ID/版本重置迁移                    | `git show e27cc9c75 -- mobile/app.json`:`com.stably.yiru.mobile`→`com.xinyao27.yiru.mobile`,version 0.0.31→0.0.0,versionCode 8→1                                               |
| Android resolver 产出 v0.0.1              | `node mobile/scripts/prepare-android-release.mjs` → `Prepared Yiru Mobile Android 0.0.1 (1)`                                                                                   |
| Android native release build 可完成       | Expo prebuild 后 JDK 17 `./gradlew assembleRelease --no-daemon` → `BUILD SUCCESSFUL`;APK 约 120 MB                                                                             |
| Android APK 使用 debug identity           | `apksigner verify --verbose --print-certs` → `CN=Android Debug`;SHA-256 signer digest 与生成的 `debug.keystore` 一致                                                           |
| mobile quality gate 已恢复                | `cd mobile && pnpm test` → 283/283 files passed;2013 passed / 2 skipped                                                                                                        |
| 桌面安全契约已恢复                        | E2EE/relay focused vitest 全通过;`pnpm typecheck:node` 通过                                                                                                                    |
| 发布工作流零运行                          | `gh run list --workflow=mobile-{ios,android}-release.yml` → `[]`;`gh release list` 仅桌面 v0.0.1/v0.0.2                                                                        |
| Android release 用 debug keystore         | 本地 `mobile/android/app/build.gradle:108-115`(prebuild 产物,gitignored)                                                                                                       |
| 无 EAS/OTA/远程 push 配置                 | `mobile/package.json`(无 expo-updates)、`mobile/app.json`(无 eas projectId)、`mobile/src/notifications/`(仅本地通知 API)                                                       |
| relay 默认域名与 env 覆盖                 | `src/main/yiru-profiles/profile-cloud-auth-config.ts:19-21,116-120`                                                                                                            |
| 默认 cloud/relay 域名不存在               | 2026-07-18:1.1.1.1、Cloudflare DoH、Google DNS 对 `login.yiru.ai`/`relay.yiru.ai` 均返回 NXDOMAIN                                                                              |
| 手机侧 relay URL 强制 HTTPS               | `src/shared/mobile-relay-pairing-offer.ts:10-20`;`src/shared/mobile-relay-credential-contract.ts:8-15`                                                                         |
| macos-26 含默认 Xcode 26.5                | [actions/runner-images macos-26 readme](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md)(2026-07-18 抓取)                                   |
| 仓库 public(macOS runner 免费)            | `gh repo view --json visibility` → PUBLIC                                                                                                                                      |

## 来源

- fastlane:[upload_to_testflight](https://docs.fastlane.tools/actions/upload_to_testflight/)、[app_store_connect_api_key](https://docs.fastlane.tools/actions/app_store_connect_api_key/)、[get_provisioning_profile (sigh)](https://docs.fastlane.tools/actions/get_provisioning_profile/)、[latest_testflight_build_number](https://docs.fastlane.tools/actions/latest_testflight_build_number/)
- Apple:[TestFlight overview(内部 ≤100 人 / 外部 ≤10,000 人,外部需 Beta App Review)](https://developer.apple.com/help/app-store-connect/test-a-beta-version/overview-of-testflight)、[Add a new app](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)、[Invite internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-internal-testers/)、[Creating App Store Connect API Keys](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)
- Expo:[Prebuild](https://docs.expo.dev/workflow/prebuild/);React Native:[Publishing a signed Android APK](https://reactnative.dev/docs/signed-apk-android)
- GitHub:[runner-images](https://github.com/actions/runner-images)、[Actions billing(public repo 标准 runner 免费)](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)
- Google Play(未集成,仅作对照):[Set up an open, closed, or internal test](https://support.google.com/googleplay/android-developer/answer/9845334)
