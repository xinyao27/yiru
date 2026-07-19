// Chinese phrase fixes from high-visibility UI audit round 5.
export const ZH_PHRASE_FIXES_ROUND5 = [
  { pattern: /Yiru集成开发环境/g, replacement: 'Yiru IDE', whenEnIncludes: 'Yiru IDE' },
  { pattern: /Yiru第一/g, replacement: 'Yiru 优先', whenEnIncludes: 'Yiru first' },
  { pattern: /Yiru移动/g, replacement: 'Yiru Mobile', whenEnIncludes: 'Yiru Mobile' },
  { pattern: /Yiru归属/g, replacement: 'Yiru 归因', whenEnIncludes: 'Yiru Attribution' },
  { pattern: /Yiru标志/g, replacement: 'Yiru 标志', whenEnIncludes: 'Yiru logo' },
  { pattern: /喜欢Yiru/g, replacement: '喜欢 Yiru', whenEnIncludes: 'Enjoying Yiru' },
  { pattern: /认识Yiru/g, replacement: '了解 Yiru', whenEnIncludes: 'Get to know Yiru' },
  { pattern: /支持Yiru/g, replacement: '支持 Yiru', whenEnIncludes: 'Support Yiru' },
  { pattern: /展开Yiru/g, replacement: '展开 Yiru', whenEnIncludes: 'Expand Yiru' },
  { pattern: /来自Yiru/g, replacement: '来自 Yiru', whenEnIncludes: 'from Yiru' },
  {
    pattern: /正在重新启动Yiru/g,
    replacement: '正在重启 Yiru',
    whenEnIncludes: 'Restarting Yiru'
  },
  { pattern: /Yiru([\u4e00-\u9fff])/g, replacement: 'Yiru $1', whenEnIncludes: 'Yiru' },
  { pattern: /Codex([\u4e00-\u9fff])/g, replacement: 'Codex $1', whenEnIncludes: 'Codex' },
  { pattern: /Claude([\u4e00-\u9fff])/g, replacement: 'Claude $1', whenEnIncludes: 'Claude' },
  { pattern: /Claude代码/g, replacement: 'Claude Code', whenEnIncludes: 'Claude Code' },
  { pattern: /托管审阅/g, replacement: '托管评审', whenEnIncludes: 'hosted-review' },
  { pattern: /托管审阅/g, replacement: '托管评审', whenEnIncludes: 'Hosted-review' },
  { pattern: /审阅笔记/g, replacement: '评审笔记', whenEnIncludes: 'review note' },
  { pattern: /审阅任务/g, replacement: '评审任务', whenEnIncludes: 'review task' },
  { pattern: /待审阅/g, replacement: '待评审', whenEnIncludes: 'need review' },
  { pattern: /重新审核/g, replacement: '重新评审', whenEnIncludes: 'Re-review' },
  { pattern: /依赖项审核/g, replacement: '依赖项审计', whenEnIncludes: 'dependency audit' },
  { pattern: /Git AI 作者/g, replacement: 'Git AI Author', whenEnIncludes: 'Git AI Author' },
  { pattern: /基本引用/g, replacement: '基础引用', whenEnIncludes: 'base ref' },
  { pattern: /重新开放/g, replacement: '重新打开', whenEnIncludes: 'reopen' },
  { pattern: /更换钥匙/g, replacement: '更换密钥', whenEnIncludes: 'Replace key' },
  {
    pattern: /根据所看到的内容采取行动/g,
    replacement: '根据所看到的内容执行操作',
    whenEnIncludes: 'act on what they see'
  },
  {
    pattern: /可操作的问题/g,
    replacement: '需处理的问题',
    whenEnIncludes: 'actionable issues'
  },
  {
    pattern: /显示 Yiru 移动按钮/g,
    replacement: '显示 Yiru Mobile 按钮',
    whenEnIncludes: 'Show Yiru Mobile Button'
  }
]
