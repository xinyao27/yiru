import { mergeLocaleKeyOverrides } from './locale-key-override-merge.mjs'

// Key-specific overrides from high-visibility UI audit (P0/P1/P2).
// Why: some fixes depend on full key context, not English value alone.
const BASE_LOCALE_KEY_OVERRIDES = {
  // "Open in" is a submenu header for "open in <app>"; bare で開く reads as broken JP.
  'auto.components.sidebar.WorktreeOpenInMenu.8009ab69a6': { ja: 'アプリで開く' },
  // "Assigned to me" filter; the MT past-passive 割り当てられました reads as a sentence, not a filter label.
  'auto.components.settings.TerminalWindowSection.c9e1fdf42f': { ja: 'カーソル' },
  'auto.components.onboarding.ThemeStep.ab2a583a97': { ja: 'カーソル' },
  'menu.reportCrash': { ko: '크래시 신고...', zh: '报告崩溃...', ja: 'クラッシュを報告...' },
  'menu.showMobileButton': {
    ko: 'Yiru 모바일 버튼 표시',
    zh: '显示 Yiru Mobile 按钮',
    ja: 'Yiru モバイル ボタンを表示'
  },
  'menu.toggleLeftSidebar': {
    ko: '왼쪽 사이드바 표시/숨기기',
    zh: '显示/隐藏左侧边栏',
    ja: '左サイドバーの表示/非表示'
  },
  'menu.toggleRightSidebar': {
    ko: '오른쪽 사이드바 표시/숨기기',
    zh: '显示/隐藏右侧边栏',
    ja: '右サイドバーの表示/非表示'
  },
  'menu.openWorktreePalette': {
    ko: '워크트리 팔레트 열기',
    zh: '打开工作树面板',
    ja: 'ワークツリーパレットを開く'
  },
  'menu.exploreYiru': { ko: 'Yiru 둘러보기', zh: '探索 Yiru', ja: 'Yiru を探索' },
  'worktreeJumpPalette.matchLabel.comment': { ko: '댓글', zh: '评论', ja: 'コメント' },
  'auto.hooks.useSettingsNavigationMetadata.13241992bd': {
    ko: '일반',
    zh: '通用',
    ja: '一般'
  },
  'auto.hooks.useSettingsNavigationMetadata.93d88d20bf': {
    ko: '외관',
    zh: '外观',
    ja: '外観'
  },
  'auto.hooks.useSettingsNavigationMetadata.1cd25673df': {
    ko: '모바일',
    zh: '移动端',
    ja: 'モバイル'
  },
  'auto.hooks.useSettingsNavigationMetadata.6a50cdcd7c': {
    ko: '음성',
    zh: '语音',
    ja: '音声'
  },
  'auto.hooks.useSettingsNavigationMetadata.580a04cd81': {
    ko: '고급',
    zh: '高级',
    ja: '詳細設定'
  },
  'auto.hooks.useSettingsNavigationMetadata.225071c560': {
    ko: '실험적',
    zh: '实验性',
    ja: '実験的機能'
  },
  'auto.hooks.useSettingsNavigationMetadata.b35e92364b': {
    ko: '컴퓨터 사용',
    zh: '计算机控制',
    ja: 'コンピュータ操作'
  },
  'auto.hooks.useSettingsNavigationMetadata.94295ebfb3': {
    ko: '단축키',
    zh: '快捷键',
    ja: 'ショートカット'
  },
  'auto.hooks.useSettingsNavigationMetadata.ded9e9032f': {
    ko: '온보딩 체크리스트',
    zh: '入门清单',
    ja: 'オンボーディングチェックリスト'
  },
  'auto.hooks.useSettingsNavigationMetadata.3618579df6': {
    ko: '개인정보 및 텔레메트리',
    zh: '隐私与遥测',
    ja: 'プライバシーとテレメトリ'
  },
  'auto.hooks.useSettingsNavigationMetadata.65b19f5bde': {
    ko: '플로팅 워크스페이스',
    zh: '浮动工作区',
    ja: 'フローティングワークスペース'
  },
  'auto.hooks.useSettingsNavigationMetadata.2b043783ef': {
    ko: '연동',
    zh: '集成',
    ja: '連携'
  },
  'auto.components.settings.Settings.9abb9be3bc': {
    ko: '설정 시작',
    zh: '初始设置',
    ja: 'セットアップ'
  },
  'auto.components.settings.SettingsSidebar.dbceaa8840': {
    ko: '설정 검색',
    zh: '搜索设置',
    ja: '設定を検索'
  },
  'auto.components.settings.SettingsSidebar.60f8a673a7': {
    ko: '앱으로 돌아가기',
    zh: '返回应用',
    ja: 'アプリに戻る'
  },
  'auto.components.settings.SettingsSidebar.82db1b7de4': {
    ko: '온보딩 체크리스트, {{value0}}/{{value1}} 완료. 설정 가이드 보기.',
    zh: '入门清单，已完成 {{value0}}/{{value1}}。显示设置指南。',
    ja: 'オンボーディングチェックリスト、{{value0}}/{{value1}} 完了。セットアップガイドを表示。'
  },
  'auto.components.settings.ShortcutFilterRail.02dc7d4251': {
    ko: '바로가기 검색',
    zh: '搜索快捷键',
    ja: 'ショートカットを検索'
  },
  'auto.components.FirstLaunchBanner.fc5cc29955': {
    ko: '거부',
    zh: '退出',
    ja: 'オプトアウト'
  },
  'auto.components.FirstLaunchBanner.94cc673726': {
    ko: '확인',
    zh: '知道了',
    ja: '了解'
  },
  'auto.components.tab.bar.TabBarCreateEntry.b27864279e': {
    ko: '에이전트 실행',
    zh: '启动代理',
    ja: 'エージェントを起動'
  },

  'auto.components.sidebar.SidebarNav.c86d83b5c3': {
    ko: '새로 만들기',
    zh: '新建',
    ja: '新規'
  },
  'auto.components.sidebar.SidebarSettingsHelpMenu.ad3d3ed7f1': {
    ko: 'Yiru 재시작',
    zh: '重启 Yiru',
    ja: 'Yiru を再起動'
  },
  'auto.components.sidebar.workspace.status.5f9ca31a84': {
    ko: '대기 중',
    zh: '等待中',
    ja: '待機中'
  },
  'auto.components.sidebar.SidebarWorkspaceFilterSection.ed1611b65b': {
    ko: '슬립 중인 항목 숨기기',
    zh: '隐藏休眠项',
    ja: 'スリープ中を非表示'
  },
  'auto.components.status.bar.ResourceUsageStatusSegment.4bb076fa89': {
    ko: '강제 종료',
    zh: '强制结束',
    ja: '強制終了'
  },
  'auto.components.status.bar.ResourceUsageStatusSegment.41ae4fa725': {
    ko: '종료 중…',
    zh: '正在结束…',
    ja: '終了中…'
  },
  'auto.components.status.bar.ResourceUsageStatusSegment.53dd5560ae': {
    ko: 'Yiru 접기',
    zh: '折叠 Yiru',
    ja: 'Yiru を折りたたむ'
  },
  'auto.components.settings.ManageSessionsSection.a06ababda0': {
    ko: '모두 강제 종료',
    zh: '全部强制结束',
    ja: 'すべて強制終了'
  },
  'auto.components.settings.ManageSessionKillDialog.d3dba51b15': {
    ko: '종료 중…',
    zh: '正在结束…',
    ja: '終了中…'
  },
  'auto.components.settings.terminal.search.920573d65b': {
    ko: '모두 종료',
    zh: '全部结束',
    ja: 'すべて終了'
  },
  'auto.components.settings.AgentsPane.2e45ca29b6': {
    ko: '명령',
    zh: '命令',
    ja: 'コマンド'
  },
  'auto.components.settings.AgentsPane.1c9a9679ec': {
    ko: '{{value0}} 사용 가능 여부',
    zh: '{{value0}} 可用性',
    ja: '{{value0}} の利用可否'
  },
  'auto.components.settings.AgentsPane.ed3e110e61': {
    ko: '감지됨',
    zh: '已检测',
    ja: '検出済み'
  },
  'auto.components.settings.AgentsPane.e8da2af684': {
    ko: '설치 가능',
    zh: '可安装',
    ja: 'インストール可能'
  },
  'auto.components.settings.AppearancePane.7d26ccabe8': {
    ko: '다크',
    zh: '深色',
    ja: 'ダーク'
  },
  'auto.components.settings.BrowserUsePane.de9b2f32f3': {
    ko: '활성화',
    zh: '启用',
    ja: '有効化'
  },
  'auto.components.settings.GeneralSupportSection.73b327e793': {
    ko: '다시 시도',
    zh: '重试',
    ja: '再試行'
  },
  'auto.components.settings.PrivacyDiagnosticBundleControls.2801d4ce22': {
    ko: '참조 ID 복사',
    zh: '复制参考 ID',
    ja: '参照 ID をコピー'
  },
  'auto.components.settings.ComputerUsePane.4b65070096': {
    ko: 'darwin',
    zh: 'darwin',
    ja: 'darwin'
  },
  'auto.components.settings.OrchestrationSkillAgentCoverage.ffe13e36fb': {
    ko: '누락',
    zh: '缺失',
    ja: '不足'
  },
  'auto.components.settings.AutoRenameBranchFromWorkSetting.1626524572': {
    ko: 'Nautilus',
    zh: 'Nautilus',
    ja: 'Nautilus'
  },
  'auto.components.settings.Settings.8bd117d669': {
    ko: '인터페이스',
    zh: '界面',
    ja: 'インターフェース'
  },
  'auto.components.skills.SkillsPage.a68dee6a32': {
    ko: '스킬 검색',
    zh: '搜索技能',
    ja: 'スキルを検索'
  },
  'auto.components.editor.RichMarkdownSlashMenu.550189b06c': {
    ko: '블록 검색',
    zh: '搜索块',
    ja: 'ブロックを検索'
  },
  'auto.web.WebConnect.e3bcd082ac': {
    ko: 'Yiru에 연결',
    zh: '连接到 Yiru',
    ja: 'Yiru に接続'
  },
  'auto.App.caea5b51b9': {
    ko: '지금 재시작',
    zh: '立即重启',
    ja: '今すぐ再起動'
  },
  'auto.App.9f0152563e': { ko: '모바일', zh: '移动端', ja: 'モバイル' },
  'auto.App.ca6c6eece7': { ko: '스킬', zh: '技能', ja: 'スキル' },
  'auto.App.62ca9895a7': { ko: '스페이스', zh: '空间', ja: 'スペース' },
  'settings.appearance.statusBar.kimiToggleDescription': {
    ko: '활성 워크스페이스의 Kimi 구독 사용량을 표시합니다.',
    zh: '显示当前工作区的 Kimi 订阅使用情况。',
    ja: 'Kimi サブスクリプション'
  },
  'auto.components.mobile.MobileHero.cd4e5e816f': {
    ko: '주머니 속의 워크스페이스.',
    zh: '您的工作区就在您的口袋里。',
    ja: 'ワークスペースをポケットに。'
  },
  'auto.components.sidebar.SidebarFeedbackDialog.d245c4ef6c': {
    ko: 'GitHub 이슈',
    zh: 'GitHub 议题',
    ja: 'GitHub イシュー'
  },
  'auto.components.settings.CommitMessageAiPane.4f722a5f53': {
    ko: '사용자 지정 명령을 선택하는 커밋 메시지, PR 및 브랜치 이름 레시피에서 사용됩니다. 사용',
    zh: '由选择自定义命令的提交消息、拉取请求和分支名称配方使用。使用',
    ja: 'カスタムコマンドを選択するコミットメッセージ、PR、ブランチ名のレシピで使用されます。使用'
  },
  'auto.components.skills.SkillsPage.38e0951c3a': {
    ko: '에이전트 스킬',
    zh: '代理技能',
    ja: 'エージェントのスキル'
  },
  'auto.components.onboarding.OnboardingFlow.04ae28d8ca': {
    ko: '몇 시간 내내 보고 싶은 테마를 선택하세요.',
    zh: '选择你想盯着看几个小时的主题。',
    ja: '何時間も眺めていたくなるテーマを選んでください。'
  },
  'auto.components.GitLabItemDialog.e089f62594': {
    ko: 'MR !{{value0}}을(를) 병합했습니다.',
    zh: '合并 MR !{{value0}}',
    ja: 'MR をマージしました !{{value0}}'
  },
  'auto.components.right.sidebar.source.control.primary.action.3d5dccef0b': {
    ko: '커밋할 것이 없습니다. PR은 이미 병합되었습니다.',
    zh: '没有可提交的内容。PR 已合并。',
    ja: 'コミットするものはありません。PR はすでにマージされています。'
  },

  'auto.components.settings.ExperimentalPane.0277901cf7': {
    ko: '완료된 에이전트, 차단 질문, 읽지 않은 상태 및 작업 트리 생성 이벤트에 대한 스레드 작업 트리 피드가 있는 에이전트 항목을 왼쪽 사이드바에 추가합니다. 실험적 — 이벤트 모델과 UI가 변경될 수 있습니다.',
    zh: '将代理条目添加到左侧边栏，其中包含已完成代理、阻塞待办、未读状态和工作树创建事件的线程工作树提要。实验性——事件模型和 UI 可能会改变。',
    ja: '完了したエージェント、ブロック中の質問、未読状態、ワークツリー作成イベントのスレッドワークツリーフィード付きエージェント項目を左サイドバーに追加します。実験的 — イベントモデルと UI は変更される場合があります。'
  },
  'auto.lib.fix.checks.agent.launch.9f00d7df0c': {
    ko: '검사 프롬프트가 비어 있습니다. 소스 제어 AI 설정을 업데이트하세요.',
    zh: '检查提示为空。请更新源代码管理 AI 设置。',
    ja: 'チェック プロンプトが空です。ソース管理 AI 設定を更新してください。'
  },

  'auto.components.mobile.MobilePage.e17393c6a3': {
    ko: '전화 미리보기',
    zh: '手机预览',
    ja: 'スマートフォンプレビュー'
  },
  'auto.components.editor.EditorContent.e4b074749d': {
    ko: '머리말',
    zh: '前言',
    ja: 'フロントマター'
  },
  'auto.components.editor.MarkdownPreview.2b2b31382c': {
    ko: '머리말',
    zh: '前言',
    ja: 'フロントマター'
  },
  'auto.components.dashboard.DashboardAgentRow.92a7017987': {
    ko: '전송 중',
    zh: '发送',
    ja: '送信中'
  },
  'auto.components.github.pr.merge.state.bf5e4c6c92': {
    ko: '차단됨',
    zh: '已阻塞',
    ja: 'ブロック中'
  },
  'auto.components.sidebar.workspace.status.93ac840dcb': {
    ko: '차단됨',
    zh: '已阻塞',
    ja: 'ブロック中'
  },
  'auto.components.sidebar.workspace.status.6c1efa2cf8': {
    ko: '검토 중',
    zh: '评审中',
    ja: 'レビュー中'
  },
  'auto.components.sidebar.workspace.status.409528031f': {
    ko: '검토',
    zh: '评审',
    ja: 'レビュー'
  },
  'auto.components.settings.GitPane.b559bf9899': {
    ko: '예: feature',
    zh: '例如 feature',
    ja: '例: feature'
  },
  'auto.components.mobile.slides.TerminalSlide.985373052e': {
    ko: '휴대폰 모드로 전환',
    zh: '切换到手机模式',
    ja: 'スマートフォンモードに切り替え'
  },
  'auto.components.right.sidebar.PortsPanel.c9d106547a': { ja: '転送' },
  // Worktree badge: stand-alone 主要な leaves the adnominal な dangling — align with the Tooltip's プライマリ.
  'auto.components.sidebar.WorktreeCard.7d517f82e2': { ja: 'プライマリ' },
  'auto.components.WorktreeJumpPalette.739bda980c': { ja: 'プライマリ' }
}

export const LOCALE_KEY_OVERRIDES = mergeLocaleKeyOverrides(BASE_LOCALE_KEY_OVERRIDES)
