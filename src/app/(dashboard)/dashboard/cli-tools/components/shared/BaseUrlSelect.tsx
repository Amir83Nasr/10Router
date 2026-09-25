"use client";
import Icon from "@/shared/components/Icon";

import { useEffect, useMemo, useRef, useState } from "react";
import { APP_PORT } from "@/shared/constants/config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  readPresets,
  upsertPreset,
  deletePreset,
  subscribePresets,
  stripSlash,
} from "./cliEndpointPresets";

const CUSTOM_VALUE = "__custom__";
const SAVE_VALUE = "__save__";

const ensureV1 = (url) => {
  const trimmed = (url || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
};

const buildOptions = ({
  requiresExternalUrl,
  tunnelEnabled,
  tunnelPublicUrl,
  tailscaleEnabled,
  tailscaleUrl,
  cloudEnabled,
  cloudUrl,
  savedPresets,
  withV1,
}) => {
  const opts = [];
  const wrap = (url) => (withV1 ? ensureV1(url) : (url || "").replace(/\/+$/, ""));
  if (!requiresExternalUrl) {
    const localUrl = wrap(`http://127.0.0.1:${APP_PORT}`);
    opts.push({ value: "local", label: localUrl, url: localUrl });
  }
  if (tunnelEnabled && tunnelPublicUrl) {
    const u = wrap(tunnelPublicUrl);
    opts.push({ value: "tunnel", label: u, url: u });
  }
  if (tailscaleEnabled && tailscaleUrl) {
    const u = wrap(tailscaleUrl);
    opts.push({ value: "tailscale", label: u, url: u });
  }
  if (cloudEnabled && cloudUrl) {
    const u = wrap(cloudUrl);
    opts.push({ value: "cloud", label: u, url: u });
  }
  savedPresets.forEach((p) => {
    opts.push({ value: `saved:${p.name}`, label: p.baseUrl, url: p.baseUrl, saved: true });
  });
  opts.push({ value: CUSTOM_VALUE, label: "Custom URL...", url: "" });
  return opts;
};

export default function BaseUrlSelect({
  value,
  onChange,
  requiresExternalUrl = false,
  tunnelEnabled = false,
  tunnelPublicUrl = "",
  tailscaleEnabled = false,
  tailscaleUrl = "",
  cloudEnabled = false,
  cloudUrl = "",
  withV1 = true,
  currentUrl = "",
}: any) {
  const [savedPresets, setSavedPresets] = useState<any[]>([]);
  const [presetsLoaded, setPresetsLoaded] = useState<boolean>(false);
  const [mode, setMode] = useState<string>("");
  const [customInput, setCustomInput] = useState<string>("");
  const initializedRef = useRef<boolean>(false);
  const customInputRef = useRef<string>("");

  useEffect(() => {
    const sync = () => {
      const presets = readPresets();
      setSavedPresets(presets);
      // A preset saved elsewhere (e.g. on Apply) takes over the custom slot
      setMode((prev) => {
        if (prev !== CUSTOM_VALUE) return prev;
        const typed = stripSlash(customInputRef.current);
        if (!typed) return prev;
        const match = presets.find((p) => {
          const saved = stripSlash(p.baseUrl);
          return saved === typed || saved === ensureV1(typed);
        });
        return match ? `saved:${match.name}` : prev;
      });
    };
    sync();
    setPresetsLoaded(true);
    return subscribePresets(sync);
  }, []);

  const options = useMemo(
    () =>
      buildOptions({
        requiresExternalUrl,
        tunnelEnabled,
        tunnelPublicUrl,
        tailscaleEnabled,
        tailscaleUrl,
        cloudEnabled,
        cloudUrl,
        savedPresets,
        withV1,
      }),
    [
      requiresExternalUrl,
      tunnelEnabled,
      tunnelPublicUrl,
      tailscaleEnabled,
      tailscaleUrl,
      cloudEnabled,
      cloudUrl,
      savedPresets,
      withV1,
    ],
  );

  // Prefer a saved preset matching the currently configured URL, else first option
  useEffect(() => {
    if (initializedRef.current) return;
    if (!presetsLoaded || options.length === 0) return;
    initializedRef.current = true;
    const current = stripSlash(currentUrl);
    const matched = current ? options.find((o) => o.saved && stripSlash(o.url) === current) : null;
    const target = matched || options.find((o) => o.value !== CUSTOM_VALUE);
    if (target) {
      setMode(target.value);
      onChange(target.url);
    } else {
      setMode(CUSTOM_VALUE);
    }
  }, [presetsLoaded, options, onChange, currentUrl]);

  const handleSelect = (next: string) => {
    if (next === SAVE_VALUE) {
      const trimmed = (value || "").trim();
      if (!trimmed) return;
      let defaultName = trimmed;
      try {
        defaultName = new URL(trimmed).host;
      } catch {}
      const name = window.prompt("Save endpoint as:", defaultName);
      const saved = name?.trim() ? upsertPreset(trimmed, name.trim()) : null;
      if (saved) setMode(`saved:${saved}`);
      return;
    }
    setMode(next);
    if (next === CUSTOM_VALUE) {
      setCustomInput("");
      onChange("");
      return;
    }
    const opt = options.find((o) => o.value === next);
    if (opt) onChange(opt.url);
  };

  const handleCustomInput = (e: any) => {
    const v = e.target.value;
    customInputRef.current = v;
    setCustomInput(v);
    onChange(v);
  };

  const handleDeleteSaved = () => {
    if (!mode.startsWith("saved:")) return;
    deletePreset(mode.slice(6));
    setCustomInput("");
    const fallback = options.find((o) => o.value !== CUSTOM_VALUE && o.value !== mode);
    if (fallback) {
      setMode(fallback.value);
      onChange(fallback.url);
    } else {
      setMode(CUSTOM_VALUE);
      onChange("");
    }
  };

  const isSaved = mode.startsWith("saved:");
  const isCustom = mode === CUSTOM_VALUE;
  const canSave = isCustom && (customInput || "").trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Select value={mode} onValueChange={handleSelect}>
          <SelectTrigger className="flex-1 min-w-0 text-xs">
            <SelectValue placeholder="Select endpoint" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} title={o.label}>
                {o.label}
              </SelectItem>
            ))}
            {canSave && <SelectItem value={SAVE_VALUE}>+ Save current as...</SelectItem>}
          </SelectContent>
        </Select>
        {isSaved && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleDeleteSaved}
                className="p-1 text-muted-foreground hover:text-red-500 rounded transition-colors shrink-0"
              >
                <Icon name="delete" className="text-[14px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Delete saved endpoint</TooltipContent>
          </Tooltip>
        )}
      </div>
      {isCustom && (
        <Input
          type="text"
          value={customInput}
          onChange={handleCustomInput}
          placeholder={withV1 ? "https://example.com/v1" : "https://example.com"}
          className="h-9 text-xs"
        />
      )}
    </div>
  );
}
