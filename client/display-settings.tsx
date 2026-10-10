import { useSettings } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { displaySettings } from "../shared/display-settings.js";

const opacityOptions = [100, 90, 80, 70, 60, 50, 40, 30].map(value => ({ label: `${value}%`, value: String(value) }));
const sizeOptions = [
  { label: "小 · 75%", value: "0.75" },
  { label: "标准 · 100%", value: "1" },
  { label: "大 · 125%", value: "1.25" },
  { label: "超大 · 150%", value: "1.5" },
];

export function DisplaySettingsScreen() {
  const settings = useSettings(displaySettings);
  if (settings.status !== "ready") {
    return <SettingsSection title="外观">
      <SettingsCard>
        <SettingsRow label={settings.status === "loading" ? "正在读取设置…" : "设置暂时不可用"}
          error={settings.status === "error" || settings.status === "invalid" ? settings.error : undefined}/>
        {settings.status !== "loading" && <SettingsAction label="重新读取设置" actionLabel="重试" onPress={() => void settings.reload()}/>}
        {settings.status === "invalid" && <SettingsAction label="恢复默认设置" actionLabel="恢复默认" disabled={settings.saving} onPress={() => void settings.reset()}/>}
      </SettingsCard>
    </SettingsSection>;
  }
  return <SettingsSection title="外观">
    <SettingsCard>
      <SettingsSelect label="透明度" hint="数值表示窗口不透明度，100% 为默认，数值越低越透明。"
        value={String(Math.round(settings.values.opacity * 100))} options={opacityOptions} disabled={settings.saving}
        onValueChange={value => void settings.save({ ...settings.values, opacity: Number(value) / 100 }, settings.revision)}/>
      <SettingsSelect label="大小" hint="同比例缩放胶囊和列表，保存后立即生效。"
        value={String(settings.values.scale)} options={sizeOptions} disabled={settings.saving}
        onValueChange={value => void settings.save({ ...settings.values, scale: Number(value) }, settings.revision)}/>
      {settings.saveError && <SettingsRow label="设置未保存" error={settings.saveError}/>}
      <SettingsAction label="恢复默认" hint="100% 不透明度、标准大小。" actionLabel="恢复默认"
        disabled={settings.saving} onPress={() => void settings.reset()}/>
    </SettingsCard>
  </SettingsSection>;
}
