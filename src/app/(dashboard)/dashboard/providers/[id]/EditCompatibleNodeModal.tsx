"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function Field({
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  label?: any;
  required?: any;
  error?: any;
  hint?: any;
  className?: string;
  children: any;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className || ""}`}>
      {label && (
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function EditCompatibleNodeModal({
  isOpen,
  node,
  onSave,
  onClose,
  isAnthropic,
}: any) {
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    apiType: "chat",
    baseUrl: "https://api.openai.com/v1",
  });
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (node) {
      setFormData({
        name: node.name || "",
        prefix: node.prefix || "",
        apiType: node.apiType || "chat",
        baseUrl:
          node.baseUrl ||
          (isAnthropic ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"),
      });
    }
  }, [node, isAnthropic]);

  const apiTypeOptions = [
    { value: "chat", label: "Chat Completions" },
    { value: "responses", label: "Responses API" },
  ];

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        name: formData.name,
        prefix: formData.prefix,
        baseUrl: formData.baseUrl,
      };
      if (!isAnthropic) {
        payload.apiType = formData.apiType;
      }
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  if (!node) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{`Edit ${isAnthropic ? "Anthropic" : "OpenAI"} Compatible`}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[calc(85vh-120px)] flex-col gap-4 overflow-y-auto p-4">
          <Field label="Name" hint="Required. A friendly label for this node.">
            <Input
              value={formData.name}
              onChange={(e: any) => setFormData({ ...formData, name: e.target.value })}
              placeholder={`${isAnthropic ? "Anthropic" : "OpenAI"} Compatible (Prod)`}
            />
          </Field>
          <Field label="Prefix" hint="Required. Used as the provider prefix for model IDs.">
            <Input
              value={formData.prefix}
              onChange={(e: any) => setFormData({ ...formData, prefix: e.target.value })}
              placeholder={isAnthropic ? "ac-prod" : "oc-prod"}
            />
          </Field>
          {!isAnthropic && (
            <Field label="API Type">
              <Select
                value={formData.apiType}
                onValueChange={(v) => setFormData({ ...formData, apiType: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {apiTypeOptions.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field
            label="Base URL"
            hint={`Use the base URL (ending in /v1) for your ${isAnthropic ? "Anthropic" : "OpenAI"}-compatible API.`}
          >
            <Input
              value={formData.baseUrl}
              onChange={(e: any) => setFormData({ ...formData, baseUrl: e.target.value })}
              placeholder={
                isAnthropic ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"
              }
            />
          </Field>
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={
              !formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim() || saving
            }
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
