"use client";

// Material Symbols (webfont) → lucide-react bridge.
//
// Keeps the existing `icon="material-icon-name"` API across the app so
// components/pages are untouched; this mapper is the single seam.
// `toLucideName` is exported for codemods that want to inline lucide
// names directly. Dynamic names ({{expr}}) still resolve at runtime.
//
// Ceiling (ponytail): eventually replace material spans + this mapper
// with direct `import { X } from "lucide-react"` at each site.

import * as React from "react";
import * as Lucide from "lucide-react";

const MAP: Record<string, string> = {
  add: "Plus",
  account_circle: "CircleUser",
  account_tree: "GitFork",
  api: "Plug",
  apps: "LayoutGrid",
  arrow_back: "ArrowLeft",
  arrow_downward: "ArrowDown",
  arrow_forward: "ArrowRight",
  arrow_upward: "ArrowUp",
  attach_file: "Paperclip",
  bar_chart: "BarChart3",
  block: "Ban",
  bolt: "Zap",
  business: "Briefcase",
  cancel: "X",
  cast: "Cast",
  chat: "MessageSquare",
  check: "Check",
  check_circle: "CheckCircle2",
  checklist: "ClipboardCheck",
  chevron_down: "ChevronDown",
  chevron_left: "ChevronLeft",
  chevron_right: "ChevronRight",
  chevron_up: "ChevronUp",
  close: "X",
  cloud: "Cloud",
  cloud_off: "CloudOff",
  cloud_sync: "CloudSync",
  cloud_upload: "CloudUpload",
  code: "Code2",
  computer: "Monitor",
  content_copy: "Copy",
  cookie: "Cookie",
  dashboard: "LayoutDashboard",
  data_array: "Table",
  data_object: "Braces",
  data_usage: "BarChart3",
  dark_mode: "Moon",
  delete: "Trash2",
  devices: "MonitorSmartphone",
  dns: "Network",
  download: "Download",
  edit: "Pencil",
  error: "CircleAlert",
  expand_more: "ChevronDown",
  extension: "Blocks",
  file_upload: "UploadCloud",
  filter_alt_off: "SlidersHorizontal",
  folder_open: "FolderOpen",
  gavel: "Scale",
  graphic_eq: "AudioWaveform",
  grid_view: "Grid2X2",
  group: "Users",
  help: "CircleHelp",
  history: "History",
  hourglass_top: "Timer",
  hub: "Router",
  image: "Image",
  image_search: "ScanSearch",
  info: "Info",
  input: "FileInput",
  key: "Key",
  keyboard_arrow_down: "ArrowDown",
  keyboard_arrow_up: "ArrowUp",
  lan: "Layers",
  language: "Languages",
  layers: "Layers",
  legend_toggle: "ListTree",
  light_mode: "Sun",
  link: "Link",
  link_off: "Link2Off",
  lock: "Lock",
  lock_open: "LockOpen",
  logout: "LogOut",
  menu: "Menu",
  menu_book: "BookOpen",
  mic: "Mic",
  monitoring: "Activity",
  monitor: "Monitor",
  movie: "Clapperboard",
  music_note: "Music",
  neurology: "Brain",
  open_in_new: "ExternalLink",
  output: "FileOutput",
  pause_circle: "CirclePause",
  person: "User",
  play_arrow: "Play",
  play_circle: "CirclePlay",
  playlist_add: "ListPlus",
  power: "Power",
  power_off: "PowerOff",
  power_settings_new: "Power",
  progress_activity: "Loader2",
  psychology: "BrainCircuit",
  public: "Earth",
  qr_code_scanner: "ScanQrCode",
  record_voice_over: "Mic",
  refresh: "RefreshCw",
  restart_alt: "RotateCcw",
  restore: "RotateCcw",
  rocket_launch: "Rocket",
  route: "Route",
  save: "Save",
  savings: "PiggyBank",
  scatter_plot: "ScatterChart",
  schedule: "Clock",
  science: "FlaskConical",
  search: "Search",
  search_off: "SearchX",
  security: "ShieldCheck",
  send: "Send",
  settings: "Settings",
  shield: "Shield",
  shield_lock: "ShieldCheck",
  shield_with_heart: "HeartPulse",
  smart_toy: "Bot",
  star: "Star",
  stop: "Square",
  stop_circle: "CircleStop",
  sync: "RefreshCw",
  sync_alt: "RefreshCw",
  terminal: "Terminal",
  toggle_off: "ToggleLeft",
  toggle_on: "ToggleRight",
  translate: "Languages",
  travel_explore: "Music4",
  upload: "Upload",
  upload_file: "UploadCloud",
  verified: "BadgeCheck",
  verified_user: "ShieldCheck",
  visibility: "Eye",
  visibility_off: "EyeOff",
  vpn_key: "KeyRound",
  vpn_lock: "Lock",
  warning: "TriangleAlert",
  wifi: "Wifi",
  wifi_off: "WifiOff",
  wifi_tethering: "Wifi",
};

// Material font-size class → pixel size for the lucide SVG (default 24).
function pxFromClass(className = ""): number | null {
  const m = String(className).match(/\[(\d+(?:\.\d+)?)px\]/);
  if (m) return Number(m[1]);
  const map: Record<string, number> = {
    "text-xs": 12,
    "text-sm": 14,
    "text-base": 16,
    "text-lg": 18,
    "text-xl": 20,
    "text-2xl": 24,
    "text-3xl": 30,
    "text-4xl": 36,
  };
  return map[String(className).match(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl)\b/)?.[0]] || null;
}

export function toLucideName(name: string): string {
  return MAP[name] || Pascal(name);
}

export interface LucideIconProps extends Omit<React.SVGAttributes<SVGSVGElement>, "name"> {
  name?: string;
  className?: string;
  // biome-ignore lint/suspicious/noExplicitAny: lucide icon components accept arbitrary SVG props
  style?: any;
}

// Lucide ignores fontSize — translate legacy fontSize/width style to px.
function pxFromValue(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d+(?:\.\d+)?)px$/);
    if (m) return Number(m[1]);
  }
  return null;
}

function pxFromStyle(style: Record<string, any> | undefined): number | null {
  if (!style || typeof style !== "object") return null;
  return pxFromValue(style.width) ?? pxFromValue(style.height) ?? pxFromValue(style.fontSize);
}

export function LucideIcon({ name = "", className, style, ...props }: LucideIconProps) {
  const icons = Lucide as unknown as Record<string, React.ComponentType<LucideIconProps>>;
  const Comp = icons[name] ?? icons[toLucideName(name)] ?? icons.Circle;
  const px = pxFromClass(className) ?? pxFromStyle(style as Record<string, any> | undefined);
  const sizeStyle = px ? { width: px, height: px } : undefined;
  const cleaned = String(className ?? "")
    .replace(/\bmaterial-symbols-outlined\b/g, "")
    .replace(/\bfill-1\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (
    <Comp
      className={cleaned}
      style={sizeStyle ? { ...sizeStyle, ...style } : style}
      aria-hidden="true"
      {...props}
    />
  );
}

export interface IconProps {
  name: string;
  className?: string;
  // biome-ignore lint/suspicious/noExplicitAny: passthrough to lucide SVG style
  style?: any;
}

export default function Icon({ name, className, style }: IconProps) {
  return <LucideIcon name={name} className={className} style={style} />;
}

function Pascal(name: string): string {
  return String(name)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
}
