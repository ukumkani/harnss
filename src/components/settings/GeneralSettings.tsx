import { memo, useState, useCallback, useEffect } from "react";
import { Download, MessageSquare, Code, Mic, Languages, Type } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SettingRow, SettingsSelect, SettingsHeader, SettingsSection } from "@/components/settings/shared";
import { DEFAULT_LANGUAGE, t } from "@/lib/i18n";
import type { AppFontFamily, AppLanguage, AppSettings, PreferredEditor, VoiceDictationMode } from "@/types";

interface GeneralSettingsProps {
  appSettings: AppSettings | null;
  onUpdateAppSettings: (patch: Partial<AppSettings>) => Promise<void>;
  language?: AppLanguage;
}

// ── Component ──

export const GeneralSettings = memo(function GeneralSettings({
  appSettings,
  onUpdateAppSettings,
  language = DEFAULT_LANGUAGE,
}: GeneralSettingsProps) {
  // Local optimistic state — synced from props once loaded
  const [automaticUpdates, setAutomaticUpdates] = useState(false);
  const [allowPrerelease, setAllowPrerelease] = useState(false);
  const [chatLimit, setChatLimit] = useState(10);
  const [preferredEditor, setPreferredEditor] = useState<PreferredEditor>("auto");
  const [voiceDictation, setVoiceDictation] = useState<VoiceDictationMode>("native");
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(language);
  const [appFontFamily, setAppFontFamily] = useState<AppFontFamily>("system");
  const [appBodyFontSize, setAppBodyFontSize] = useState(11);

  useEffect(() => {
    if (appSettings) {
      setAutomaticUpdates(appSettings.automaticUpdatesEnabled);
      setAllowPrerelease(appSettings.allowPrereleaseUpdates);
      setChatLimit(appSettings.defaultChatLimit || 10);
      setPreferredEditor(appSettings.preferredEditor || "auto");
      setVoiceDictation(appSettings.voiceDictation || "native");
      setSelectedLanguage(appSettings.language || DEFAULT_LANGUAGE);
      setAppFontFamily(appSettings.appFontFamily || "system");
      setAppBodyFontSize(Math.max(10, appSettings.appBodyFontSize || 11));
    }
  }, [appSettings]);

  const handleTogglePrerelease = useCallback(
    async (checked: boolean) => {
      setAllowPrerelease(checked); // optimistic
      await onUpdateAppSettings({ allowPrereleaseUpdates: checked });
    },
    [onUpdateAppSettings],
  );

  const handleToggleAutomaticUpdates = useCallback(
    async (checked: boolean) => {
      setAutomaticUpdates(checked);
      if (!checked) {
        setAllowPrerelease(false);
      }
      await onUpdateAppSettings({
        automaticUpdatesEnabled: checked,
        ...(!checked ? { allowPrereleaseUpdates: false } : {}),
      });
    },
    [onUpdateAppSettings],
  );

  const handleChatLimitChange = useCallback(
    async (value: number) => {
      const clamped = Math.max(5, Math.min(100, value));
      setChatLimit(clamped);
      await onUpdateAppSettings({ defaultChatLimit: clamped });
    },
    [onUpdateAppSettings],
  );

  const handleEditorChange = useCallback(
    async (value: PreferredEditor) => {
      setPreferredEditor(value); // optimistic
      await onUpdateAppSettings({ preferredEditor: value });
    },
    [onUpdateAppSettings],
  );

  const handleVoiceDictationChange = useCallback(
    async (value: VoiceDictationMode) => {
      setVoiceDictation(value); // optimistic
      await onUpdateAppSettings({ voiceDictation: value });
    },
    [onUpdateAppSettings],
  );

  const handleLanguageChange = useCallback(
    async (value: AppLanguage) => {
      setSelectedLanguage(value);
      await onUpdateAppSettings({ language: value });
    },
    [onUpdateAppSettings],
  );

  const handleFontFamilyChange = useCallback(
    async (value: AppFontFamily) => {
      setAppFontFamily(value);
      await onUpdateAppSettings({ appFontFamily: value });
    },
    [onUpdateAppSettings],
  );

  const handleFontSizeChange = useCallback(
    async (value: number) => {
      const next = Math.max(10, value);
      setAppBodyFontSize(next);
      await onUpdateAppSettings({ appBodyFontSize: next });
    },
    [onUpdateAppSettings],
  );

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader title={t(language, "settings.general.title")} description={t(language, "settings.general.description")} />

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 py-2">
          <SettingsSection icon={Languages} label={t(language, "settings.general.language.section")} first>
            <SettingRow
              label={t(language, "settings.general.language.label")}
              description={t(language, "settings.general.language.description")}
            >
              <SettingsSelect
                value={selectedLanguage}
                onValueChange={handleLanguageChange}
                options={[
                  { value: "en", label: t(language, "settings.general.language.english") },
                  { value: "zh-CN", label: t(language, "settings.general.language.chinese") },
                ]}
              />
            </SettingRow>
          </SettingsSection>

          <SettingsSection icon={Type} label={t(language, "settings.general.font.section")}>
            <SettingRow
              label={t(language, "settings.general.font.family.label")}
              description={t(language, "settings.general.font.family.description")}
            >
              <SettingsSelect
                value={appFontFamily}
                onValueChange={handleFontFamilyChange}
                options={[
                  { value: "system", label: t(language, "settings.general.font.system") },
                  { value: "arial", label: t(language, "settings.general.font.arial") },
                  { value: "helvetica", label: t(language, "settings.general.font.helvetica") },
                  { value: "serif", label: t(language, "settings.general.font.serif") },
                  { value: "mono", label: t(language, "settings.general.font.mono") },
                ]}
              />
            </SettingRow>
            <SettingRow
              label={t(language, "settings.general.font.size.label")}
              description={t(language, "settings.general.font.size.description")}
            >
              <input
                type="number"
                min={10}
                step={1}
                value={appBodyFontSize}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setAppBodyFontSize(Number.isFinite(next) ? Math.max(10, next) : 10);
                }}
                onBlur={(event) => {
                  void handleFontSizeChange(Number(event.target.value));
                }}
                className="h-8 w-24 rounded-md border border-foreground/10 bg-background px-2.5 text-sm text-foreground outline-none transition-colors hover:border-foreground/20 focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20"
              />
            </SettingRow>
          </SettingsSection>

          {/* ── Updates section ── */}
          <SettingsSection icon={Download} label={t(language, "settings.general.updates.section")}>
            <SettingRow
              label={t(language, "settings.general.updates.automatic.label")}
              description={t(language, "settings.general.updates.automatic.description")}
            >
              <Switch
                checked={automaticUpdates}
                onCheckedChange={handleToggleAutomaticUpdates}
              />
            </SettingRow>
            <SettingRow
              label={t(language, "settings.general.updates.prerelease.label")}
              description={t(language, "settings.general.updates.prerelease.description")}
            >
              <Switch
                checked={automaticUpdates && allowPrerelease}
                disabled={!automaticUpdates}
                onCheckedChange={handleTogglePrerelease}
              />
            </SettingRow>
          </SettingsSection>

          {/* ── Sidebar section ── */}
          <SettingsSection icon={MessageSquare} label={t(language, "settings.general.sidebar.section")}>
            <SettingRow
              label={t(language, "settings.general.sidebar.chatLimit.label")}
              description={t(language, "settings.general.sidebar.chatLimit.description")}
            >
              <SettingsSelect
                value={String(chatLimit)}
                onValueChange={(v) => handleChatLimitChange(Number(v))}
                options={[5, 10, 15, 20, 25, 30, 50, 100].map((n) => ({ value: String(n), label: String(n) }))}
              />
            </SettingRow>
          </SettingsSection>

          {/* ── Editor section ── */}
          <SettingsSection icon={Code} label={t(language, "settings.general.editor.section")}>
            <SettingRow
              label={t(language, "settings.general.editor.default.label")}
              description={t(language, "settings.general.editor.default.description")}
            >
              <SettingsSelect
                value={preferredEditor}
                onValueChange={handleEditorChange}
                options={[
                  { value: "auto", label: t(language, "settings.general.editor.auto") },
                  { value: "cursor", label: "Cursor" },
                  { value: "code", label: "VS Code" },
                  { value: "zed", label: "Zed" },
                ]}
              />
            </SettingRow>
          </SettingsSection>

          {/* ── Voice Dictation section ── */}
          <SettingsSection icon={Mic} label={t(language, "settings.general.voice.section")}>
            <SettingRow
              label={t(language, "settings.general.voice.mode.label")}
              description={t(language, "settings.general.voice.mode.description")}
            >
              <SettingsSelect
                value={voiceDictation}
                onValueChange={handleVoiceDictationChange}
                options={[
                  { value: "native", label: t(language, "settings.general.voice.native") },
                  { value: "whisper", label: t(language, "settings.general.voice.whisper") },
                ]}
              />
            </SettingRow>
          </SettingsSection>
        </div>
      </ScrollArea>
    </div>
  );
});
