"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { RotateCcw, X } from "lucide-react";

import {
  DEFAULT_READER_SETTINGS,
  FONT_LABELS,
  READER_THEMES,
  resolveReaderTheme,
} from "@/lib/reader/defaults";
import { cn } from "@/lib/utils";
import type {
  ReaderAnimation,
  ReaderFontFamily,
  ReaderSettings,
  ReaderTextAlign,
} from "@/shared/types";

interface ReaderSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
}

const fontOptions: Array<{ value: ReaderFontFamily; label: string }> = [
  { value: "sans", label: FONT_LABELS.sans },
  { value: "serif", label: FONT_LABELS.serif },
  { value: "kai", label: FONT_LABELS.kai },
];

const animationOptions: Array<{ value: ReaderAnimation; label: string }> = [
  { value: "slide", label: "滑动" },
  { value: "fade", label: "淡入" },
  { value: "none", label: "关闭" },
  { value: "scroll", label: "上下滚动" },
];

const alignOptions: Array<{ value: ReaderTextAlign; label: string }> = [
  { value: "justify", label: "两端对齐" },
  { value: "left", label: "左对齐" },
];

export function ReaderSettingsPanel({
  open,
  onOpenChange,
  settings,
  onChange,
}: ReaderSettingsPanelProps) {
  const theme = resolveReaderTheme(settings);

  function patch(next: Partial<ReaderSettings>) {
    onChange({ ...settings, ...next });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(94vw,370px)] flex-col border-l border-line bg-surface shadow-2xl outline-none">
          <div className="flex h-16 items-center justify-between border-b border-line px-5">
            <Dialog.Title className="text-base font-semibold">阅读设置</Dialog.Title>
            <Dialog.Close
              className="grid size-9 place-items-center rounded-base hover:bg-black/5"
              aria-label="关闭设置"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            调整字体、行距、版面、主题和翻页方式。
          </Dialog.Description>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <SettingGroup label="字体">
              <Segmented
                value={settings.fontFamily}
                options={fontOptions}
                onChange={(fontFamily) => patch({ fontFamily })}
              />
            </SettingGroup>

            <RangeSetting
              label="字号"
              value={settings.fontSize}
              min={14}
              max={32}
              step={1}
              suffix="px"
              onChange={(fontSize) => patch({ fontSize })}
            />
            <RangeSetting
              label="行距"
              value={settings.lineHeight}
              min={1.4}
              max={2.2}
              step={0.1}
              suffix=""
              onChange={(lineHeight) => patch({ lineHeight })}
            />
            <RangeSetting
              label="段距"
              value={settings.paragraphSpacing}
              min={0}
              max={2}
              step={0.1}
              suffix="em"
              onChange={(paragraphSpacing) => patch({ paragraphSpacing })}
            />
            <RangeSetting
              label="版心宽度"
              value={settings.contentWidth}
              min={520}
              max={980}
              step={20}
              suffix="px"
              onChange={(contentWidth) => patch({ contentWidth })}
            />

            <SettingGroup label="文本对齐">
              <Segmented
                value={settings.textAlign}
                options={alignOptions}
                onChange={(textAlign) => patch({ textAlign })}
              />
            </SettingGroup>

            <SettingGroup label="页面主题">
              <div className="grid grid-cols-3 gap-2">
                {READER_THEMES.map((option) => {
                  const selected = settings.themeId === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={cn(
                        "flex h-16 flex-col items-center justify-center gap-1.5 rounded-base border text-xs transition-colors",
                        selected
                          ? "border-accent ring-1 ring-accent"
                          : "border-line hover:border-accent/60",
                      )}
                      onClick={() => patch({ themeId: option.id })}
                      aria-pressed={selected}
                    >
                      <span
                        className="size-7 rounded-full border border-black/10 shadow-sm"
                        style={{ backgroundColor: option.background }}
                      />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </SettingGroup>

            {settings.themeId === "custom" ? (
              <SettingGroup label="自定义颜色">
                <div className="grid grid-cols-2 gap-3">
                  <ColorSetting
                    label="背景"
                    value={settings.customBackground}
                    onChange={(customBackground) => patch({ customBackground })}
                  />
                  <ColorSetting
                    label="文字"
                    value={settings.customForeground}
                    onChange={(customForeground) => patch({ customForeground })}
                  />
                </div>
              </SettingGroup>
            ) : null}

            <SettingGroup label="翻页方式">
              <Segmented
                value={settings.animation}
                options={animationOptions}
                onChange={(animation) => patch({ animation })}
              />
            </SettingGroup>

            <button
              type="button"
              onClick={() => onChange(DEFAULT_READER_SETTINGS)}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-base border border-line text-sm text-muted hover:border-accent hover:text-foreground"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              恢复默认设置
            </button>
          </div>

          <div
            className="h-1 shrink-0"
            style={{ backgroundColor: theme.background }}
            aria-hidden="true"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h3 className="mb-2.5 text-xs font-semibold text-muted">{label}</h3>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid min-w-0 grid-flow-col auto-cols-fr rounded-base border border-line bg-surface-raised p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 min-w-0 whitespace-nowrap rounded-[5px] px-1 text-[13px] transition-colors",
            value === option.value
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground",
          )}
          style={{ fontSize: "13px", lineHeight: 1.25 }}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function RangeSetting({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mb-6 block">
      <span className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full accent-[var(--accent)]"
      />
    </label>
  );
}

function ColorSetting({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-muted">
      <span className="mb-2 block">{label}</span>
      <span className="flex h-10 items-center gap-2 rounded-base border border-line px-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="size-6 cursor-pointer border-0 bg-transparent p-0"
        />
        <span className="font-mono text-[11px] uppercase text-foreground">{value}</span>
      </span>
    </label>
  );
}
