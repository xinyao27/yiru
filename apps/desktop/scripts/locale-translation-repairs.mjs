// Simplified Chinese repair rules applied after machine translation.\n\n// Latin workflow/brand terms that get a space inserted around them when CJK machine
// translation glues them to native text (see applyCjkLatinTermSpacing).
export const CJK_LATIN_SPACED_TERMS = [
  'Issues',
  'Issue',
  'Terminal',
  'Terminals',
  'terminal',
  'terminals',
  'Agents',
  'Agent',
  'agents',
  'agent',
  'Markdown',
  'markdown',
  'Repos',
  'Repo',
  'repos',
  'repo',
  'Commits',
  'Commit',
  'commits',
  'commit',
  'GitHub',
  'GitLab',
  'Claude',
  'Claude Code',
  'Codex',
  'Gemini',
  'Kimi',
  'OpenCode',
  'Yiru',
  'Cursor',
  'Bitbucket',
  'Tailscale',
  'Kagi',
  'SSH',
  'WSL',
  'PR',
  'MR',
  'REST',
  'HEAD',
  'Bash',
  'PowerShell',
  'Git AI Author',
  'Token',
  'token'
]

export const LOCALE_PHRASE_FIXES = {
  zh: [
    { pattern: /客服人员/g, replacement: '代理', whenEnIncludes: 'agent' },
    { pattern: /会议/g, replacement: '会话', whenEnIncludes: 'session' },
    { pattern: /港口/g, replacement: '端口', whenEnIncludes: 'ort' },
    { pattern: /公关/g, replacement: 'PR', whenEnIncludes: 'PR' },
    { pattern: /虎鲸:\/\//g, replacement: 'yiru://', whenEnIncludes: 'yiru://' },
    { pattern: /代理商/g, replacement: '代理', whenEnIncludes: 'agent' },
    { pattern: /智能体/g, replacement: 'Agent', whenEnIncludes: 'agent' },
    { pattern: /分支机构/g, replacement: '分支', whenEnIncludes: 'ranch' },
    { pattern: /座席/g, replacement: '代理', whenEnIncludes: 'agent' },
    { pattern: /汽车/g, replacement: '自动', whenEnIncludes: 'Auto' },
    { pattern: /清爽/g, replacement: '刷新中', whenEnIncludes: 'Refreshing' },
    { pattern: /瓦斯尔/g, replacement: 'WSL', whenEnIncludes: 'wsl' },
    { pattern: /细绳/g, replacement: '字符串', whenEnIncludes: 'string' },
    { pattern: /在职的/g, replacement: '处理中', whenEnIncludes: 'Working' },
    { pattern: /编曲/g, replacement: '编排', whenEnIncludes: 'Orchestration' },
    { pattern: /复制票据/g, replacement: '复制参考 ID', whenEnIncludes: 'Copy reference ID' },
    { pattern: /达尔文/g, replacement: 'darwin', whenEnIncludes: 'darwin' },
    { pattern: /外貌/g, replacement: '外观', whenEnIncludes: 'Appearance' },
    { pattern: /一般的/g, replacement: '通用', whenEnIncludes: 'General' },
    { pattern: /先进的/g, replacement: '高级', whenEnIncludes: 'Advanced' },
    { pattern: /实验性的/g, replacement: '实验性', whenEnIncludes: 'Experimental' },
    { pattern: /移动的/g, replacement: '移动端', whenEnIncludes: 'Mobile' },
    { pattern: /嗓音/g, replacement: '语音', whenEnIncludes: 'Voice' },
    { pattern: /电脑使用/g, replacement: '计算机控制', whenEnIncludes: 'Computer Use' },
    { pattern: /快捷方式/g, replacement: '快捷键', whenEnIncludes: 'Shortcuts' },
    { pattern: /入职清单/g, replacement: '入门清单', whenEnIncludes: 'Onboarding checklist' },
    { pattern: /发射代理/g, replacement: '启动代理', whenEnIncludes: 'Launch agent' },
    { pattern: /地位/g, replacement: '状态', whenEnIncludes: 'Status' },
    { pattern: /受让人/g, replacement: '负责人', whenEnIncludes: 'assignee' },
    { pattern: /开放工作区/g, replacement: '打开工作区', whenEnIncludes: 'Open workspace' },
    { pattern: /工作空间/g, replacement: '工作区', whenEnIncludes: 'Workspace' },
    { pattern: /丢失的/g, replacement: '缺失', whenEnIncludes: 'Missing' },
    {
      pattern: /聆听捷径/g,
      replacement: '正在录制快捷键',
      whenEnIncludes: 'Listening for shortcut'
    },
    { pattern: /寻找捷径/g, replacement: '搜索快捷键', whenEnIncludes: 'Find shortcuts' },
    { pattern: /连接到Yiru/g, replacement: '连接到 Yiru', whenEnIncludes: 'Connect to Yiru' },
    {
      pattern: /开始使用Yiru/g,
      replacement: '开始使用 Yiru',
      whenEnIncludes: 'get started with Yiru'
    },
    { pattern: /本机桌面/g, replacement: '原生桌面', whenEnIncludes: 'Native desktop' },
    { pattern: /当前的/g, replacement: '当前', whenEnIncludes: 'Current' },
    { pattern: /返回应用程序/g, replacement: '返回应用', whenEnIncludes: 'Back to app' },
    { pattern: /可以安装/g, replacement: '可安装', whenEnIncludes: 'Available to install' },
    { pattern: /未已检测/g, replacement: '未检测到', whenEnIncludes: 'detected' },
    { pattern: /(?<!未)检测到/g, replacement: '已检测', whenEnIncludes: 'detected' },
    { pattern: /技巧/g, replacement: '技能', whenEnIncludes: 'skill' },
    { pattern: /地点/g, replacement: '位置', whenEnIncludes: 'location' },
    { pattern: /PR已/g, replacement: '拉取请求已', whenEnIncludes: 'Pull request' },
    { pattern: /此PR/g, replacement: '此拉取请求', whenEnIncludes: 'pull request' },
    { pattern: /先生！/g, replacement: 'MR !', whenEnIncludes: 'MR' },
    { pattern: /USB设备/g, replacement: 'USB 设备', whenEnIncludes: 'USB Devices' },
    { pattern: /球队/g, replacement: '团队', whenEnIncludes: 'teams' },
    {
      pattern: / {{value0}} 或 {{value1}} /g,
      replacement: ' {{value0}}/{{value1}} ',
      whenEnIncludes: 'of {{value1}} done'
    },
    { pattern: /GitHub 问题/g, replacement: 'GitHub 议题', whenEnIncludes: 'issue' },
    { pattern: /GitLab 问题/g, replacement: 'GitLab 议题', whenEnIncludes: 'issue' },
    { pattern: /问题类型/g, replacement: '议题类型', whenEnIncludes: 'issue' },
    { pattern: /问题来源/g, replacement: '议题来源', whenEnIncludes: 'issue' },
    { pattern: /问题源/g, replacement: '议题源', whenEnIncludes: 'issue' },
    { pattern: /问题标题/g, replacement: '议题标题', whenEnIncludes: 'issue' },
    { pattern: /问题描述/g, replacement: '议题描述', whenEnIncludes: 'issue' },
    { pattern: /问题标识符/g, replacement: '议题标识符', whenEnIncludes: 'issue' },
    { pattern: /问题编号/g, replacement: '议题编号', whenEnIncludes: 'issue' },
    { pattern: /问题自动化/g, replacement: '议题自动化', whenEnIncludes: 'issue' },
    { pattern: /问题集/g, replacement: '议题集', whenEnIncludes: 'issue' },
    { pattern: /从问题开始工作区/g, replacement: '从议题开始工作区', whenEnIncludes: 'issue' },
    { pattern: /问题所附/g, replacement: '议题所附', whenEnIncludes: 'issue' },
    { pattern: /此问题所附/g, replacement: '此议题所附', whenEnIncludes: 'issue' },
    { pattern: /在提交此问题之前/g, replacement: '在提交此议题之前', whenEnIncludes: 'issue' },
    { pattern: /在创建问题之前/g, replacement: '在创建议题之前', whenEnIncludes: 'issue' },
    { pattern: /创建一个新问题/g, replacement: '创建一个新议题', whenEnIncludes: 'issue' },
    { pattern: /从选定的问题开始/g, replacement: '从选定的议题开始', whenEnIncludes: 'issue' },
    { pattern: /更新了问题/g, replacement: '更新了议题', whenEnIncludes: 'issue' },
    { pattern: /更多问题工作区/g, replacement: '更多议题工作区', whenEnIncludes: 'issue' },
    { pattern: /搜索 GitHub 问题/g, replacement: '搜索 GitHub 议题', whenEnIncludes: 'issue' },
    { pattern: /打开 GitHub 问题/g, replacement: '打开 GitHub 议题', whenEnIncludes: 'issue' },
    {
      pattern: /自定义 GitHub 问题命令/g,
      replacement: '自定义 GitHub 议题命令',
      whenEnIncludes: 'issue'
    },
    { pattern: /链接问题/g, replacement: '链接议题', whenEnIncludes: 'issue' },
    { pattern: /链接的问题/g, replacement: '链接的议题', whenEnIncludes: 'issue' },
    { pattern: /GH问题/g, replacement: 'GH 议题', whenEnIncludes: 'issue' },
    { pattern: /问题 #/g, replacement: '议题 #', whenEnIncludes: 'issue' },
    { pattern: /问题没有/g, replacement: '议题没有', whenEnIncludes: 'issue' },
    { pattern: /项目问题/g, replacement: '项目议题', whenEnIncludes: 'issue' },
    { pattern: /范围问题/g, replacement: '范围议题', whenEnIncludes: 'issue' },
    { pattern: /提出问题/g, replacement: '提交议题', whenEnIncludes: 'file an issue' },
    { pattern: /创建问题/g, replacement: '创建议题', whenEnIncludes: 'issue' },
    { pattern: /分配问题/g, replacement: '分配议题', whenEnIncludes: 'issue' },
    { pattern: /编辑问题/g, replacement: '编辑议题', whenEnIncludes: 'issue' },
    { pattern: /查看问题/g, replacement: '查看议题', whenEnIncludes: 'issue' },
    { pattern: /无法创建问题/g, replacement: '无法创建议题', whenEnIncludes: 'issue' },
    { pattern: /无法加载问题/g, replacement: '无法加载议题', whenEnIncludes: 'issue' },
    { pattern: /没有分配的问题/g, replacement: '没有分配的议题', whenEnIncludes: 'issue' },
    {
      pattern: /没有与所选预设匹配的问题/g,
      replacement: '没有与所选预设匹配的议题',
      whenEnIncludes: 'issue'
    },
    {
      pattern: /没有获取与所选团队匹配的问题/g,
      replacement: '没有获取与所选团队匹配的议题',
      whenEnIncludes: 'issue'
    },
    { pattern: /浏览和链接问题/g, replacement: '浏览和链接议题', whenEnIncludes: 'issue' },
    {
      pattern: /浏览、创建和链接问题/g,
      replacement: '浏览、创建和链接议题',
      whenEnIncludes: 'issue'
    },
    {
      pattern: /拉取请求、问题和检查/g,
      replacement: '拉取请求、议题和检查',
      whenEnIncludes: 'issue'
    },
    {
      pattern: /合并请求、问题和管道/g,
      replacement: '合并请求、议题和管道',
      whenEnIncludes: 'issue'
    },
    {
      pattern: /合并请求、问题、待办/g,
      replacement: '合并请求、议题、待办',
      whenEnIncludes: 'issue'
    },
    { pattern: /提交、PR 和问题/g, replacement: '提交、PR 和议题', whenEnIncludes: 'issue' },
    { pattern: /粘贴问题 URL/g, replacement: '粘贴议题 URL', whenEnIncludes: 'issue' },
    { pattern: /阅读问题/g, replacement: '阅读议题', whenEnIncludes: 'issue' },
    { pattern: /已打开问题/g, replacement: '已打开议题', whenEnIncludes: 'issue' },
    {
      pattern: /打开 {{value0}} 问题/g,
      replacement: '打开 {{value0}} 议题',
      whenEnIncludes: 'issue'
    },
    { pattern: /显示问题来自/g, replacement: '显示议题来自', whenEnIncludes: 'issue' },
    { pattern: /队伍/g, replacement: '团队', whenEnIncludes: 'teams' },
    { pattern: /新特征/g, replacement: '新功能', whenEnIncludes: 'New features' },
    { pattern: /审稿人/g, replacement: '评审人', whenEnIncludes: 'reviewer' },
    { pattern: /审阅者/g, replacement: '评审人', whenEnIncludes: 'reviewer' },
    { pattern: /电话/g, replacement: '手机', whenEnIncludes: 'phone' },
    { pattern: /发射器/g, replacement: '启动器', whenEnIncludes: 'launcher' },
    { pattern: /发射/g, replacement: '启动', whenEnIncludes: 'launch' },
    { pattern: /完全的/g, replacement: '已完成', whenEnIncludes: 'Completed' },
    { pattern: /排队/g, replacement: '内联', whenEnIncludes: 'Inline' },
    { pattern: /需要审查/g, replacement: '待评审', whenEnIncludes: 'Needs review' },
    { pattern: /需要审查/g, replacement: '待评审', whenEnIncludes: 'need review' },
    { pattern: /审核中/g, replacement: '评审中', whenEnIncludes: 'In review' },
    { pattern: /已请求审核/g, replacement: '已请求评审', whenEnIncludes: 'Review requested' },
    { pattern: /托管审核/g, replacement: '托管评审', whenEnIncludes: 'hosted review' },
    { pattern: /托管审核/g, replacement: '托管评审', whenEnIncludes: 'Hosted review' },
    { pattern: /审查冲突/g, replacement: '评审冲突', whenEnIncludes: 'Review conflicts' },
    { pattern: /审查笔记/g, replacement: '评审笔记', whenEnIncludes: 'Review Notes' },
    { pattern: /例如特征/g, replacement: '例如 feature', whenEnIncludes: 'e.g. feature' },
    { pattern: /字体特征/g, replacement: '字体特性', whenEnIncludes: 'font features' },
    { pattern: /审核批准/g, replacement: '评审批准', whenEnIncludes: 'review approval' },
    { pattern: /行动食谱/g, replacement: '操作方案', whenEnIncludes: 'action recipes' },
    { pattern: /更多行动/g, replacement: '更多操作', whenEnIncludes: 'More actions' },
    { pattern: /更多PR行动/g, replacement: '更多 PR 操作', whenEnIncludes: 'More PR actions' },
    { pattern: /的集体行动/g, replacement: '的分组操作', whenEnIncludes: 'Group actions' },
    {
      pattern: /没有阻碍PR行动/g,
      replacement: '没有阻塞 PR 操作',
      whenEnIncludes: 'blocking PR action'
    },
    { pattern: /被阻止/g, replacement: '已阻塞', whenEnIncludes: 'pull request is blocked' },
    { pattern: /查看 ＃/g, replacement: '检查 #', whenEnIncludes: 'check #' },
    { pattern: /指挥进展/g, replacement: 'Conductor 进度', whenEnIncludes: 'Conductor Progress' },
    { pattern: /指挥评论/g, replacement: 'Conductor 评审', whenEnIncludes: 'Conductor Review' },
    { pattern: /指挥完成/g, replacement: 'Conductor 完成', whenEnIncludes: 'Conductor Done' },
    { pattern: /琥珀色/g, replacement: 'Amber', whenEnIncludes: 'Amber' },
    { pattern: /蓝色的/g, replacement: 'Blue', whenEnIncludes: 'Blue' },
    { pattern: /中性的/g, replacement: 'Neutral', whenEnIncludes: 'Neutral' },
    { pattern: /破坏性的/g, replacement: 'destructive', whenEnIncludes: 'destructive' },
    { pattern: /注解/g, replacement: '批注', whenEnIncludes: 'Annotation' },
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
    {
      pattern: /Claude([\u4e00-\u9fff])/g,
      replacement: 'Claude $1',
      whenEnIncludes: 'Claude'
    },
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
    { pattern: /可操作的问题/g, replacement: '需处理的问题', whenEnIncludes: 'actionable issues' },
    {
      pattern: /显示 Yiru 移动按钮/g,
      replacement: '显示 Yiru Mobile 按钮',
      whenEnIncludes: 'Show Yiru Mobile Button'
    }
  ]
}

// Distinguishes the on-screen cursor (光标) from the "Cursor" product so the brand
// revert in the translation policy doesn't force terminal/theme cursor settings back to Latin.

// Multi-word "Cursor …" labels always mean the screen cursor, never the Cursor product.
const SCREEN_CURSOR_ENVALUES = new Set([
  'Cursor Text',
  'Cursor color',
  'Cursor Opacity',
  'Cursor Shape',
  'Blinking Cursor',
  'Terminal Cursor'
])

// Bare "Cursor" is ambiguous; these keys are the terminal/theme cursor settings (screen cursor).
const SCREEN_CURSOR_KEYS = new Set([
  'auto.components.settings.TerminalWindowSection.c9e1fdf42f',
  'auto.components.onboarding.ThemeStep.ab2a583a97'
])

export function isScreenCursorContext(brand, enValue, key) {
  if (brand !== 'Cursor') {
    return false
  }
  return SCREEN_CURSOR_ENVALUES.has(enValue) || SCREEN_CURSOR_KEYS.has(key)
}
