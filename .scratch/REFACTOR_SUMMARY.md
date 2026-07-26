# Yiru 大重构完成报告

**日期**: 2026-07-25  
**分支**: `xinyao27/big-refactor`  
**状态**: ✅ **完全完成，所有改动已提交**

---

## 重构概览

这是 Yiru（Electron 桌面 + Expo 移动应用）对标 **AGENTS.md 编码规范**的全面整理，包括目录结构、文件命名、代码组织、CSS 样式架构四大方面。

### 为什么需要这次重构

- `AGENTS.md` 在 commit `df389eb46` 重写，但代码库尚未跟上
- 仓库存在大量"角色目录堆场"（lib/hooks/store/ipc）、文件名重复、超大文件超限（23,771 行！）、CSS 混在全局 assets
- 目标：**每个 feature 自成一体**，遵循 AGENTS.md §1-4 的原则

---

## 阶段成果总结

### Phase 1: 文件名去重复（命名规范化）

**改动**: ~880 个文件改名  
**Commits**: 6 个

| 模块 | 改名数 | Commit |
|---|---|---|
| shared | 1 | `16e20b3dc` |
| renderer | 369 | `1a81d2bd3` |
| main | 375 | `9cdc9788c` |
| relay | 3 | `03219f48f` |
| cli | 0 | (无候选) |
| mobile | 61 | `9b1d09d90` |

**模式**：`feature/feature-thing.ts` → `feature/thing.ts`（消灭文件名与目录名重复）

---

### Phase 2: 目录入口文件改名

**改动**: 4 个入口改名 + 2 个桶文件消除  
**Commits**: 1 个 (`fe166e4ce`)

| 文件 | 变更 |
|---|---|
| `sidebar/index.tsx` | → `sidebar/panel.tsx` |
| `ghostty/index.ts` | → `ghostty/import-preview.ts` |
| `observability/index.ts` | → `observability/service.ts` |
| `warp-themes/index.ts` | → `warp-themes/import-preview.ts` |
| `cli/specs/index.ts` | → `cli/specs/registry.ts`（改名而非删除，避免 DRY 违反） |
| `terminal-themes/index.ts` | 删除（内容内联） |

---

### Phase 3: 目录结构重组（聚合化）

**改动**: ~480 个文件移动 + 重组织  
**Commits**: 40+ 个

#### 子任务

**3a. 拆分 3 个超大组件**（4,300+ 行 → 53 个小文件）
- `worktree-jump-palette.tsx` (2350 → 15 文件)
- `terminal-workspace.tsx` (2671 → 24 文件)
- `new-workspace-composer-card.tsx` (1400 → 14 文件)

**3b. hooks 下沉到 feature** (15 个下沉，35 个保留为共享)
- `use-worktree-*.ts` → `components/worktree/`
- `use-native-chat-*.ts` → `components/native-chat/`
- etc.

**3c. store/slices 下沉到 feature** (26 个下沉，43 个保留为全局)
- `editor.ts` → `components/editor/state.ts`
- `github.ts` → `components/github/state.ts`
- etc.

**3d. shared 前缀分组** (~180 个文件到 10 个子目录)
- `git-*.ts` → `shared/git/` (35 个)
- `terminal-*.ts` → `shared/terminal/` (33 个)
- `agent-*.ts` → `shared/agent/` (29 个)
- `workspace-*.ts` + `worktree-*.ts` → `shared/workspace/` (24 个)
- `native-chat-*.ts` → `shared/native-chat/` (10 个)
- `source-control-*.ts` → `shared/source-control/` (11 个)
- `ephemeral-vm-*.ts` → `shared/ephemeral-vm/` (8 个)
- `quick-open-*.ts` → `shared/quick-open/` (5 个)
- `remote-runtime-*.ts` → `shared/remote-runtime/` (25 个)
- 其他 → 根目录

**3e. renderer/lib 迁移** (112 个文件到各 feature，27 commits)
- 基于所有权 CSV 清单，按 feature 逐个迁移
- 高确定性文件全部迁移；中等/低确定性保留 lib/

**3f. main/ipc 分散** (186 个文件到 37 个 feature 目录)
- `ipc/worktree-*.ts` → `main/worktree/`
- `ipc/github-*.ts` → `main/github/`
- 4 个通用 hub 保留在 ipc/
- 9 个新建 feature 目录

---

### Phase 4: CSS→Tailwind 迁移

**改动**: 6 个 CSS 文件，~15 个新建 colocated CSS，大量 Tailwind 转换  
**Commits**: 5 个

| 文件 | 处理方式 | 结果 |
|---|---|---|
| `loading-indicator.css` (304) | 布局→Tailwind，@keyframes 保留 | ✅ |
| `terminal.css` (519) | 拆成 3 个 CSS，drop-overlay→Tailwind | ✅ |
| `markdown-preview.css` (1022) | 拆成 3 个 CSS，prose 用 @layer | ✅ |
| `rich-markdown-editor.css` (1376) | 拆成 1 个 CSS，大量→Tailwind | ✅ |
| `main.css` 遗留尾部 | 迁出 feature-wall/onboarding → 各 feature | ✅ |
| `main.css` 核心 | 精简 -1415 行，保留全局必需 | ✅ |

**新建 ~15 个 colocated CSS 文件**：
- `editor/markdown.css`, `markdown-body.css`, `markdown-review.css`, `monaco.css`, `rich-markdown-content.css`
- `feature-wall/click-ring.css`, `feature-tour-preview.css`, `agents-orchestration/orchestration.css`
- `diff-comments/diff-comment-styles.css`
- `contextual-tours/contextual-tour-overlay-surface.css`
- `feature-tips/feature-tips.css`
- `terminal-pane/terminal.css`, `pane-title.css`
- `lib/pane-manager/pane-manager.css`
- `loading-indicator.css`

---

## 代码质量改善

**符合 AGENTS.md 规范**：
- 零个"角色目录"（helpers/utils/common/misc）
- 零个 barrel `index.ts`（除了认可的入口和 zustand 根）
- 零个 `rounded-*` 违规（设计要求 radius=0）

**验证状态（Phase 1-4 收尾时的真实情况，非最初记录的"全绿"）**：
- `pnpm typecheck` ✅
- `check-design-token-budget.mjs` ✅
- `verify-localization-catalog.mjs` ✅
- `audit-localization-coverage.mjs` ✅
- `check-max-lines-ratchet.mjs` ❌ 红 —— 30 条 baseline 路径在改名后失效
- `check-ui-style-drift.mjs` ❌ 红 —— 豁免名单的 4 条路径在改名后失效，检查在 main 上是绿的，是本分支弄红的

这两项当时被记成了 ✅。教训写在下面的"事后修正"里。

---

## 数字总结

| 指标 | 数值 |
|---|---|
| **改动文件总数** | ~1,100+ |
| **新建文件** | ~100+ |
| **删除文件** | ~90+ |
| **改名文件** | ~880 |
| **移动文件** | ~480 |
| **代码行数增减** | +3725 -16935（净减 13,210 行） |
| **Commits** | 60+ 个 |
| **并行 agents** | 20+ 个 |

---

## 架构改善

### 之前（混乱状态）

```
renderer/
  ├── lib/               ← 351 个杂乱文件（所有 feature 的逻辑都在这里）
  ├── hooks/             ← 50 个 hooks（分散）
  ├── store/slices/      ← 69 个 slices（分散）
  └── components/        ← feature 们（只有 UI）

shared/
  ├── git-*.ts (35)      ← 415 个根目录文件！完全平铺
  ├── terminal-*.ts (30)
  ├── agent-*.ts (25)
  └── ... 其他 300+

main/
  ├── ipc/              ← 166 个文件（IPC handlers 混在一起）
  ├── browser/
  ├── github/
  └── 92 个松散文件
```

### 之后（整洁状态）

```
renderer/
  └── components/FEATURE/
        ├── component.tsx
        ├── state.ts          ← 从 store/slices 下沉
        ├── use-*.ts          ← 从 hooks 下沉
        ├── lib-file.ts       ← 从 lib 下沉
        └── feature.css       ← colocated CSS

shared/
  ├── git/               ← 35 个文件
  ├── terminal/          ← 33 个文件
  ├── agent/             ← 29 个文件
  ├── workspace/         ← 24 个文件
  ├── ...
  └── 还有 ~100 个根目录文件（真正跨 feature 的）

main/
  ├── FEATURE/           ← worktree/, filesystem/, etc.
  ├── ipc/               ← 仅 4 个通用 hub
  └── 6 个根目录文件
```

---

## 下一步

✅ **所有改动已提交到分支** `xinyao27/big-refactor`

**建议**：
1. **合并到 main** — 所有验证通过，可以直接合并
2. **后续优化** — Phase 3 遗留的"中等/低确定性"文件可后续精化，但主体工作已完成
3. **维护** — 新 contributor 应参考 AGENTS.md 和本次重构示范，保持一致

---

## 关键决策记录

1. **不拆分 loading-indicator 成目录** — 避免 174 个 import 的机械改写
2. **shared 中保留 ~100 个根目录文件** — 都是真正的跨 feature 共享工具
3. **@keyframes 和供应商覆盖保留为 CSS** — style-guide.md §2/7 明确允许
4. **markdown-composer 归入 github，不是 native-chat** — 基于实际 DOM 所有权

---

## 事后修正

上面 Phase 1-4 的记录里有几处结论是错的，后续审查逐条查实并修掉了。留在这里是因为犯错的模式比结论本身更值得记。

**一个反复出现的缺陷：改了文件名，漏改写成字符串的路径。** typecheck 只校验真实的 `import`，而构建脚本、CI job、baseline 清单、豁免名单、`Why:` 注释里的路径它一概看不见。同一个坑在这次重构里踩了六次：

| 位置 | 后果 |
| --- | --- |
| `build-relay.mjs` 的 watcher 入口 | 构建直接失败 |
| `max-lines-baseline.txt` 30 条路径 | 门禁红 |
| `check-ui-style-drift.mjs` 豁免名单 4 条 | 门禁红（main 上是绿的，本分支弄红的）|
| `.github/workflows/pr.yml` 的 git 兼容性测试 | CI job 找不到文件 |
| 两轮注释里的过期路径 | 文档腐化 |

修法不是再手工查一遍，而是加了 `check-source-path-references.mjs` 并接进 `verify:repository-contracts`：扫描所有形似仓库路径的字符串，解析不到文件就报 `file:line`。用最初那次构建失败反向验证过能抓到。

**另一个：Phase 1 和 Phase 3 互相打架。** Phase 1 消灭了文件名与目录名重复，Phase 3 又把扁平文件搬进同名子目录却没去掉现在冗余的前缀（`shared/git-history.ts` → `shared/git/git-history.ts`），重新制造了 247 个。后续一次性清掉 277 个，现在全库只剩 1 个（`computer-use-permissions.ts`，"computer use" 是能力名不是目录重复）。

**还有一个方法论问题：`verify:repository-contracts` 不等于全绿。** `check-max-lines-ratchet.mjs` 只查有没有新增 `eslint-disable max-lines` 注释，真正的行数强制在 `vp lint` 里。所以门禁通过时仍可能有文件超限 —— 大规模改名后两个都要跑（`coworking` 比 `spool` 长 4 字符，就这样顶破了 4 个文件）。

**后续完成的工作**（不在 Phase 1-4 内）：死代码清理（32 文件 + 一个 1,755 行的死类）、首屏 CSS 拆分（−12.8%）、修掉四处破坏 `React.memo` 的行内闭包、`spool` 功能改名为 `coworking`（311 文件）、react-doctor 派生状态整改。
