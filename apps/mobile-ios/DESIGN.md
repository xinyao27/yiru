# Liquid Glass Design System

Yiru iOS 的设计语言由系统 Liquid Glass、清晰的内容层和少量品牌氛围组成。它不是把每张
卡片都模糊化；玻璃代表导航、控制和临时浮层，内容仍然保持稳定、可读和高性能。

## 承重原则

1. **系统组件优先。** `NavigationStack`、toolbar、sheet、menu、search、tab 和 Button
   首先使用原生形态，让 iOS 26 自动提供玻璃外观、形变、命中反馈与辅助功能。
2. **玻璃只在功能层。** 自定义玻璃用于浮动操作组、临时 HUD 和必须悬在内容之上的
   控件。列表行、代码、diff、terminal、聊天气泡和普通内容卡片不使用玻璃。
3. **一个层级一个 owner。** 页面决定布局；Design System 决定 token 和共享视觉语法；
   feature 决定自己的信息结构。Feature 不复制全局颜色、间距或玻璃配方。
4. **颜色来自玻璃背后的内容。** 背景允许克制的品牌氛围，控件本身不堆叠手工阴影、
   高光和多层描边去仿造玻璃。
5. **可读性优先于效果。** Reduce Transparency、Reduce Motion、Increase Contrast、动态
   字体、深浅色和浅色壁纸都必须可用。

## 组件决策树

添加 UI 前按顺序判断：

1. SwiftUI 是否已有语义正确的标准组件？有则直接使用。
2. 是否只是一个 feature 私有组合？留在 `Features/<Name>/UI`。
3. 是否被三个以上无关 feature 使用，并且拥有统一视觉不变量？才进入
   `DesignSystem/Components`。
4. 是否需要自定义玻璃？只有浮动或交互控制层回答“是”。普通内容 surface 回答“否”。

## Liquid Glass 合同

- 本包最低 iOS 26，直接使用最新 API，不写 `#available` fallback。
- `glassEffect` 放在 frame、padding、shape 等布局 modifier 之后。
- 只有能点击、拖拽或选择的自定义玻璃使用 `.interactive()`。
- 多个相邻自定义玻璃放入同一个 `GlassEffectContainer`，spacing 使用 Theme token。
- 标准 `Button` 使用 `.buttonStyle(.glass)` 或 `.glassProminent`，不再额外叠
  `glassEffect`。
- tint 表达语义或主操作，不是装饰。destructive、warning、connected 等状态使用系统
  semantic color。
- 玻璃不承载长文本、diff、代码或 terminal 内容；这些内容使用不透明或系统 content
  background 保证对比度。

## Token

所有跨 feature 数值集中在 `DesignSystem/Foundations/Theme.swift`：

- spacing 使用 4 / 8 / 12 / 16 / 20 / 24 / 32 的阶梯；
- radius 只定义 content、control、floating surface 三种语义；
- typography 使用动态系统 text style，不在 View 写固定字号；
- animation 使用系统 `.snappy` / `.smooth` token，并尊重 Reduce Motion；
- opacity、glass spacing、minimum hit target 和页面边距不在 feature 内重复硬编码。

内容本身需要的语义色——ANSI terminal、diff、syntax highlighting、agent identity、图片和
状态——属于 feature/domain，不强行压成品牌色。

## 页面语法

- 页面以系统 background 为底，可以使用 `AtmosphereBackground` 提供克制的蓝紫氛围。
- 主内容使用 `ScrollView` + lazy container 或 `List`；大型集合不得用 eager stack。
- 页面标题和首要操作进入 navigation/toolbar，由系统生成玻璃。
- 浮动底部操作组使用 `GlassActionGroup`；同一操作不能同时出现在 toolbar 与浮层。
- 空状态优先使用 `ContentUnavailableView`。
- 状态 chip 使用 `SemanticBadge`，它不是玻璃，避免每个小标签都产生昂贵折射层。

## 动效与性能

- 动效解释状态变化、空间关系或操作结果，不为静态装饰持续运行。
- 玻璃 morph 只用于同一组控件的插入、移除和形态切换，identity 必须稳定。
- transcript、terminal、diff 和文件树是性能红线：窄观察、lazy 渲染、稳定 identity、可
  取消任务；不在 cell body 中做 Markdown parse、diff parse、图片 decode 或网络读取。
- 每个复杂页面在浅色/深色、Reduce Transparency、Reduce Motion、最大动态字体和 iPad
  分屏下验收。
