"use client";
import { ArrowDown, ArrowUp, Layers, Plus, X } from "lucide-react";

import { useState, useEffect } from "react";
import Modal from "./Modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ModelSelectModal from "./ModelSelectModal";

const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

// Inline editable model item
interface ModelItemProps {
  index?: any;
  model?: any;
  isFirst?: boolean;
  isLast?: boolean;
  onEdit?: any;
  onMoveUp?: any;
  onMoveDown?: any;
  onRemove?: any;
}

function ModelItem({
  index,
  model,
  isFirst,
  isLast,
  onEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
}: ModelItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(model);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== model) onEdit(trimmed);
    else setDraft(model);
    setEditing(false);
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setDraft(model);
      setEditing(false);
    }
  };
  return (
    <div className="group flex min-w-0 items-center gap-1.5 rounded-md bg-black/[0.02] px-2 py-1 transition-colors hover:bg-black/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]">
      <span className="text-[10px] font-medium text-muted-foreground w-3 text-center shrink-0">
        {index + 1}
      </span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 rounded border border-primary/40 bg-white px-1.5 py-0.5 font-mono text-xs text-foreground outline-none dark:bg-black/20"
        />
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="min-w-0 flex-1 cursor-text truncate rounded px-1.5 py-0.5 font-mono text-xs text-foreground hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => setEditing(true)}
            >
              {model}
            </div>
          </TooltipTrigger>
          <TooltipContent>Click to edit</TooltipContent>
        </Tooltip>
      )}
      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              className={`p-0.5 rounded ${isFirst ? "text-muted-foreground/20 cursor-not-allowed" : "text-muted-foreground hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
            >
              <ArrowUp className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Move up</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              className={`p-0.5 rounded ${isLast ? "text-muted-foreground/20 cursor-not-allowed" : "text-muted-foreground hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
            >
              <ArrowDown className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Move down</TooltipContent>
        </Tooltip>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onRemove}
            className="p-0.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-500 transition-all"
          >
            <X className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Remove</TooltipContent>
      </Tooltip>
    </div>
  );
}

// Reusable Combo create/edit modal. forcePrefix auto-prepends to name.
interface ComboFormModalProps {
  isOpen?: boolean;
  combo?: any;
  onClose?: () => void;
  onSave?: any;
  activeProviders?: any;
  kindFilter?: any;
  forcePrefix?: string;
  title?: any;
}

export default function ComboFormModal({
  isOpen,
  combo,
  onClose,
  onSave,
  activeProviders,
  kindFilter = null,
  forcePrefix = "",
  title,
}: ComboFormModalProps) {
  // Strip prefix when editing existing combo so user only edits suffix
  const initialName = combo?.name
    ? forcePrefix && combo.name.startsWith(forcePrefix)
      ? combo.name.slice(forcePrefix.length)
      : combo.name
    : "";
  const [name, setName] = useState(initialName);
  const [models, setModels] = useState(combo?.models || []);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [modelAliases, setModelAliases] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/models/alias")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setModelAliases(d.aliases || {}))
      .catch(() => {});
  }, [isOpen]);

  const validateName = (value) => {
    if (!value.trim()) {
      setNameError("Name is required");
      return false;
    }
    const full = forcePrefix + value;
    if (!VALID_NAME_REGEX.test(full)) {
      setNameError("Only letters, numbers, -, _ and . allowed");
      return false;
    }
    setNameError("");
    return true;
  };

  const handleNameChange = (e) => {
    let value = e.target.value;
    // If user types prefix manually, strip it (we always prepend)
    if (forcePrefix && value.startsWith(forcePrefix)) value = value.slice(forcePrefix.length);
    setName(value);
    if (value) validateName(value);
    else setNameError("");
  };

  const handleAddModel = (model) => {
    if (!models.includes(model.value)) setModels([...models, model.value]);
  };
  const handleDeselectModel = (model) => {
    setModels(models.filter((m) => m !== model.value));
  };
  const handleRemoveModel = (i) => setModels(models.filter((_, idx) => idx !== i));
  const handleMoveUp = (i) => {
    if (i === 0) return;
    const a = [...models];
    [a[i - 1], a[i]] = [a[i], a[i - 1]];
    setModels(a);
  };
  const handleMoveDown = (i) => {
    if (i === models.length - 1) return;
    const a = [...models];
    [a[i], a[i + 1]] = [a[i + 1], a[i]];
    setModels(a);
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    setSaving(true);
    await onSave({ name: forcePrefix + name.trim(), models });
    setSaving(false);
  };

  const isEdit = !!combo;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={title || (isEdit ? "Edit Combo" : "Create Combo")}
      >
        <div className="flex flex-col gap-3">
          <div>
            {forcePrefix ? (
              <>
                <label className="text-sm font-medium mb-1 block">Combo Name</label>
                <div className="flex items-stretch">
                  <span className="inline-flex items-center px-2 rounded-l border border-r-0 border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] text-muted-foreground font-mono text-sm">
                    {forcePrefix}
                  </span>
                  <input
                    value={name}
                    onChange={handleNameChange}
                    placeholder="my-combo"
                    className="flex-1 min-w-0 rounded-r border border-black/10 dark:border-white/10 bg-white dark:bg-black/20 px-2 py-1.5 font-mono text-sm outline-none focus:border-primary"
                  />
                </div>
                {nameError && <p className="text-[11px] text-red-500 mt-0.5">{nameError}</p>}
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Combo Name</label>
                <Input
                  value={name}
                  onChange={handleNameChange}
                  placeholder="my-combo"
                  className={nameError ? "ring-1 ring-red-500 border-red-500/40" : undefined}
                />
                {nameError && <p className="text-xs text-red-500">{nameError}</p>}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {forcePrefix ? `Auto-prefixed with "${forcePrefix}". ` : ""}Only letters, numbers, -,
              _ and . allowed
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Models</label>
            {models.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-black/10 dark:border-white/10 rounded-lg bg-black/[0.01] dark:bg-white/[0.01]">
                <Layers className="mx-auto mb-1 size-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No models added yet</p>
              </div>
            ) : (
              <div className="flex max-h-[55vh] min-w-0 flex-col gap-1 overflow-y-auto sm:max-h-[350px]">
                {models.map((model, index) => (
                  <ModelItem
                    key={index}
                    index={index}
                    model={model}
                    isFirst={index === 0}
                    isLast={index === models.length - 1}
                    onEdit={(v) => {
                      const a = [...models];
                      a[index] = v;
                      setModels(a);
                    }}
                    onMoveUp={() => handleMoveUp(index)}
                    onMoveDown={() => handleMoveDown(index)}
                    onRemove={() => handleRemoveModel(index)}
                  />
                ))}
              </div>
            )}
            <button
              onClick={() => setShowModelSelect(true)}
              className="w-full mt-2 py-2 border border-dashed border-black/10 dark:border-white/10 rounded-lg text-xs text-primary font-medium hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="size-4" />
              Add Model
            </button>
          </div>

          <Button
            onClick={handleSave}
            className="w-full"
            size="sm"
            disabled={!name.trim() || !!nameError || saving}
          >
            {saving ? "Saving..." : isEdit ? "Save" : "Create"}
          </Button>
        </div>
      </Modal>

      {showModelSelect && (
        <ModelSelectModal
          isOpen={showModelSelect}
          onClose={() => setShowModelSelect(false)}
          onSelect={handleAddModel}
          onDeselect={handleDeselectModel}
          selectedModel={undefined}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title="Add Model to Combo"
          kindFilter={kindFilter}
          addedModelValues={models}
          closeOnSelect={false}
        />
      )}
    </>
  );
}
