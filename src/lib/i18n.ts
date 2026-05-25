import type { AppLanguage } from "@/types";

export type TranslationKey =
  | "settings.title"
  | "settings.nav.general"
  | "settings.nav.appearance"
  | "settings.nav.notifications"
  | "settings.nav.analytics"
  | "settings.nav.acpAgents"
  | "settings.nav.mcpServers"
  | "settings.nav.engines"
  | "settings.nav.skills"
  | "settings.nav.customAgents"
  | "settings.nav.advanced"
  | "settings.nav.about"
  | "settings.nav.soon"
  | "settings.general.title"
  | "settings.general.description"
  | "settings.general.language.section"
  | "settings.general.language.label"
  | "settings.general.language.description"
  | "settings.general.language.english"
  | "settings.general.language.chinese"
  | "settings.general.updates.section"
  | "settings.general.updates.automatic.label"
  | "settings.general.updates.automatic.description"
  | "settings.general.updates.prerelease.label"
  | "settings.general.updates.prerelease.description"
  | "settings.general.sidebar.section"
  | "settings.general.sidebar.chatLimit.label"
  | "settings.general.sidebar.chatLimit.description"
  | "settings.general.editor.section"
  | "settings.general.editor.default.label"
  | "settings.general.editor.default.description"
  | "settings.general.editor.auto"
  | "settings.general.voice.section"
  | "settings.general.voice.mode.label"
  | "settings.general.voice.mode.description"
  | "settings.general.voice.native"
  | "settings.general.voice.whisper"
  | "settings.placeholder.skills.description"
  | "settings.placeholder.customAgents.description";

const EN: Record<TranslationKey, string> = {
  "settings.title": "Settings",
  "settings.nav.general": "General",
  "settings.nav.appearance": "Appearance",
  "settings.nav.notifications": "Notifications",
  "settings.nav.analytics": "Analytics",
  "settings.nav.acpAgents": "ACP Agents",
  "settings.nav.mcpServers": "MCP Servers",
  "settings.nav.engines": "Engines",
  "settings.nav.skills": "Skills",
  "settings.nav.customAgents": "Agents",
  "settings.nav.advanced": "Advanced",
  "settings.nav.about": "About",
  "settings.nav.soon": "Soon",
  "settings.general.title": "General",
  "settings.general.description": "Application-wide preferences",
  "settings.general.language.section": "Language",
  "settings.general.language.label": "Language",
  "settings.general.language.description": "Choose the display language for Harnss.",
  "settings.general.language.english": "English",
  "settings.general.language.chinese": "中文",
  "settings.general.updates.section": "Updates",
  "settings.general.updates.automatic.label": "Automatic updates",
  "settings.general.updates.automatic.description": "Check for app updates and show update notifications.",
  "settings.general.updates.prerelease.label": "Include pre-release updates",
  "settings.general.updates.prerelease.description": "Receive beta versions with the latest features. Disable to only get stable releases.",
  "settings.general.sidebar.section": "Sidebar",
  "settings.general.sidebar.chatLimit.label": "Recent chats per project",
  "settings.general.sidebar.chatLimit.description": "Number of chats shown by default in each project. Click 'Show more' in the sidebar to load additional chats.",
  "settings.general.editor.section": "Editor",
  "settings.general.editor.default.label": "Default editor",
  "settings.general.editor.default.description": "Choose which editor opens when you click 'Open in Editor'. Auto tries Cursor, VS Code, then Zed.",
  "settings.general.editor.auto": "Auto",
  "settings.general.voice.section": "Voice Dictation",
  "settings.general.voice.mode.label": "Dictation mode",
  "settings.general.voice.mode.description": "Native uses your OS dictation (macOS only). Whisper runs a local AI model for speech-to-text on all platforms (~40 MB download on first use).",
  "settings.general.voice.native": "Native (OS)",
  "settings.general.voice.whisper": "Whisper (Local AI)",
  "settings.placeholder.skills.description": "Create, install, and manage agent skills that extend what your AI coding agents can do.",
  "settings.placeholder.customAgents.description": "Build and configure custom agents with specialized tools, prompts, and workflows.",
};

const ZH_CN: Record<TranslationKey, string> = {
  "settings.title": "设置",
  "settings.nav.general": "通用",
  "settings.nav.appearance": "外观",
  "settings.nav.notifications": "通知",
  "settings.nav.analytics": "分析",
  "settings.nav.acpAgents": "ACP Agent",
  "settings.nav.mcpServers": "MCP 服务器",
  "settings.nav.engines": "引擎",
  "settings.nav.skills": "技能",
  "settings.nav.customAgents": "Agent",
  "settings.nav.advanced": "高级",
  "settings.nav.about": "关于",
  "settings.nav.soon": "即将推出",
  "settings.general.title": "通用",
  "settings.general.description": "应用级偏好设置",
  "settings.general.language.section": "语言",
  "settings.general.language.label": "语言",
  "settings.general.language.description": "选择 Harnss 的显示语言。",
  "settings.general.language.english": "English",
  "settings.general.language.chinese": "中文",
  "settings.general.updates.section": "更新",
  "settings.general.updates.automatic.label": "自动更新",
  "settings.general.updates.automatic.description": "检查应用更新并显示更新通知。",
  "settings.general.updates.prerelease.label": "包含预发布版本更新",
  "settings.general.updates.prerelease.description": "接收包含最新功能的测试版本。关闭后只接收稳定版本。",
  "settings.general.sidebar.section": "侧边栏",
  "settings.general.sidebar.chatLimit.label": "每个项目的最近聊天数",
  "settings.general.sidebar.chatLimit.description": "每个项目默认显示的聊天数量。可在侧边栏点击“显示更多”加载额外聊天。",
  "settings.general.editor.section": "编辑器",
  "settings.general.editor.default.label": "默认编辑器",
  "settings.general.editor.default.description": "选择点击“在编辑器中打开”时使用的编辑器。自动会依次尝试 Cursor、VS Code、Zed。",
  "settings.general.editor.auto": "自动",
  "settings.general.voice.section": "语音听写",
  "settings.general.voice.mode.label": "听写模式",
  "settings.general.voice.mode.description": "原生模式使用系统听写（仅 macOS）。Whisper 会在本地运行 AI 语音转文字模型（首次使用约需下载 40 MB）。",
  "settings.general.voice.native": "原生（系统）",
  "settings.general.voice.whisper": "Whisper（本地 AI）",
  "settings.placeholder.skills.description": "创建、安装和管理用于扩展 AI 编程 Agent 能力的技能。",
  "settings.placeholder.customAgents.description": "构建和配置带有专用工具、提示词和工作流的自定义 Agent。",
};

const TRANSLATIONS: Record<AppLanguage, Record<TranslationKey, string>> = {
  en: EN,
  "zh-CN": ZH_CN,
};

export const DEFAULT_LANGUAGE: AppLanguage = "en";

export const UI_TEXT_ZH_CN: Record<string, string> = {
  "Settings": "设置",
  "General": "通用",
  "Appearance": "外观",
  "Notifications": "通知",
  "Analytics": "分析",
  "ACP Agents": "ACP Agent",
  "MCP Servers": "MCP 服务器",
  "Engines": "引擎",
  "Skills": "技能",
  "Agents": "Agent",
  "Advanced": "高级",
  "About": "关于",
  "Soon": "即将推出",
  "Language": "语言",
  "Updates": "更新",
  "Automatic updates": "自动更新",
  "Include pre-release updates": "包含预发布版本更新",
  "Sidebar": "侧边栏",
  "Recent chats per project": "每个项目的最近聊天数",
  "Editor": "编辑器",
  "Default editor": "默认编辑器",
  "Voice Dictation": "语音听写",
  "Dictation mode": "听写模式",
  "Auto": "自动",
  "Native (OS)": "原生（系统）",
  "Whisper (Local AI)": "Whisper（本地 AI）",
  "Terminal": "终端",
  "Browser": "浏览器",
  "Source Control": "源代码管理",
  "Open Files": "打开的文件",
  "Project Files": "项目文件",
  "Tasks": "任务",
  "Files": "文件",
  "Git": "Git",
  "Tools": "工具",
  "New Chat": "新聊天",
  "Chat": "聊天",
  "Search": "搜索",
  "Search chats": "搜索聊天",
  "Search messages": "搜索消息",
  "No results": "无结果",
  "Loading...": "加载中...",
  "Saving...": "保存中...",
  "Downloading...": "下载中...",
  "Restarting...": "正在重启...",
  "Update": "更新",
  "Restart": "重启",
  "Cancel": "取消",
  "Save": "保存",
  "Delete": "删除",
  "Rename": "重命名",
  "Edit": "编辑",
  "Copy": "复制",
  "Copied": "已复制",
  "Close": "关闭",
  "Open": "打开",
  "Add": "添加",
  "Remove": "移除",
  "Create": "创建",
  "Import": "导入",
  "Continue": "继续",
  "Back": "返回",
  "Next": "下一步",
  "Done": "完成",
  "Retry": "重试",
  "Pin": "置顶",
  "Unpin": "取消置顶",
  "Move to folder": "移动到文件夹",
  "Remove from folder": "从文件夹移除",
  "Open in split": "在分屏中打开",
  "Set icon": "设置图标",
  "Clear icon": "清除图标",
  "Delete project": "删除项目",
  "New folder": "新建文件夹",
  "New branch": "新建分支",
  "Move to space": "移动到空间",
  "Open Jira board": "打开 Jira 看板",
  "Show more": "显示更多",
  "Show less": "收起",
  "Projects": "项目",
  "Spaces": "空间",
  "Pinned": "已置顶",
  "Recent": "最近",
  "Today": "今天",
  "Yesterday": "昨天",
  "This week": "本周",
  "Older": "更早",
  "Welcome": "欢迎",
  "Model": "模型",
  "Permission mode": "权限模式",
  "Plan mode": "计划模式",
  "Thinking": "思考",
  "Ask": "询问",
  "Accept": "接受",
  "Reject": "拒绝",
  "Approve": "批准",
  "Deny": "拒绝",
  "Send": "发送",
  "Stop": "停止",
  "Attach": "附加",
  "Screenshot": "截图",
  "Microphone": "麦克风",
  "Command": "命令",
  "No project selected": "未选择项目",
  "Select project": "选择项目",
  "Create project": "创建项目",
  "Browse": "浏览",
  "Refresh": "刷新",
  "Connect": "连接",
  "Connected": "已连接",
  "Disconnected": "已断开",
  "Authentication required": "需要认证",
  "Pre-release version": "预发布版本",
  "Switch to stable": "切换到稳定版",
  "available": "可用",
  "ready": "就绪",
};

export function isAppLanguage(value: string): value is AppLanguage {
  return value === "en" || value === "zh-CN";
}

export function t(language: AppLanguage | undefined, key: TranslationKey): string {
  return TRANSLATIONS[language ?? DEFAULT_LANGUAGE]?.[key] ?? EN[key];
}

export function translateUiText(language: AppLanguage | undefined, text: string): string {
  if (language !== "zh-CN") return text;
  return UI_TEXT_ZH_CN[text] ?? text;
}
