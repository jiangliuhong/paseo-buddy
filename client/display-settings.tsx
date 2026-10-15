import { useState } from "react";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsInput, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { displaySettings, pillTextSchema } from "../shared/display-settings.js";
import { CompanionSettings } from "./companion-settings.js";

const opacityOptions = [100, 90, 80, 70, 60, 50, 40, 30].map(value => ({ label: `${value}%`, value: String(value) }));
const heightOptions = [100, 120, 140, 160, 180, 200, 240, 280, 320, 360, 420, 480, 540, 600].map(value => ({ label: `${value} pt`, value: String(value) }));
const sizeOptions = [
  { label: "小 · 75%", value: "0.75" },
  { label: "标准 · 100%", value: "1" },
  { label: "大 · 125%", value: "1.25" },
  { label: "超大 · 150%", value: "1.5" },
];

export function DisplaySettingsScreen() {
  return <>
    <CompanionSettings/>
    <AppearanceSettings/>
  </>;
}

function AppearanceSettings() {
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
      <SettingsSelect label="Agents 最小高度" hint="列表按内容自适应；高度随大小设置同比例缩放，屏幕空间不足时会进一步收缩。"
        value={String(settings.values.listMinHeight)} options={heightOptions.filter(option => Number(option.value) <= settings.values.listMaxHeight)} disabled={settings.saving}
        onValueChange={value => void settings.save({ ...settings.values, listMinHeight: Number(value) }, settings.revision)}/>
      <SettingsSelect label="Agents 最大高度" hint="默认保持原来的 360 pt，超过后滚动显示。"
        value={String(settings.values.listMaxHeight)} options={heightOptions.filter(option => Number(option.value) >= settings.values.listMinHeight)} disabled={settings.saving}
        onValueChange={value => void settings.save({ ...settings.values, listMaxHeight: Number(value) }, settings.revision)}/>
      <SettingsSwitch label="显示图标" value={settings.values.showIcon} disabled={settings.saving}
        onValueChange={value => void settings.save({ ...settings.values, showIcon: value }, settings.revision)}/>
      <SettingsSwitch label="显示文本" hint="隐藏图标或文本后，胶囊会自动收紧；计数为 0 时不预留徽章空位。"
        value={settings.values.showText} disabled={settings.saving}
        onValueChange={value => void settings.save({ ...settings.values, showText: value }, settings.revision)}/>
      <CustomTextSetting key={settings.values.customText} value={settings.values.customText}
        disabled={settings.saving || !settings.values.showText}
        save={value => void settings.save({ ...settings.values, customText: value }, settings.revision)}/>
      {settings.saveError && <SettingsRow label="设置未保存" error={settings.saveError}/>}
      <SettingsAction label="恢复默认" hint="100% 不透明度、标准大小、显示图标和 Buddy 文本，Agents 高度 140–360 pt。" actionLabel="恢复默认"
        disabled={settings.saving} onPress={() => void settings.reset()}/>
    </SettingsCard>
  </SettingsSection>;
}

function CustomTextSetting({ value, disabled, save }: { value: string; disabled: boolean; save: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const parsed = pillTextSchema.safeParse(draft);
  return <>
    <SettingsInput label="自定义文本" hint="最多 32 个字符，保存后立即显示。关闭文本开关不会清除已保存内容；留空也可隐藏文本。"
      initialValue={value} placeholder="Buddy" disabled={disabled} onChangeText={setDraft}
      error={parsed.success ? undefined : "请输入不超过 32 个字符的单行文本。"}/>
    <SettingsAction label="保存胶囊文本" actionLabel="保存文本" disabled={disabled || !parsed.success || parsed.data === value}
      onPress={() => { if (parsed.success) save(parsed.data); }}/>
  </>;
}
