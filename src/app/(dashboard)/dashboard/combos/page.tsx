"use client";

import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Gavel,
  GripVertical,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  CapacityBadges,
  ModelSelectModal,
  Page,
  PageHeader,
  Section,
  PanelSkeleton,
} from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useModelCaps } from "@/shared/hooks/useModelCaps";

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

type ProviderConnection = {
  id?: string;
  provider: string;
  name?: string;
  isActive?: boolean;
  providerSpecificData?: { prefix?: string };
};

type Combo = {
  id: string;
  name: string;
  models: string[];
  kind?: string;
};

type ConfirmState = {
  title: string;
  message: string;
  confirmText?: string;
  onConfirm: () => void;
};

export default function CombosPage() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);
  const [activeProviders, setActiveProviders] = useState<ProviderConnection[]>([]);
  const [comboStrategies, setComboStrategies] = useState<Record<string, Record<string, unknown>>>(
    {},
  );
  const { getCaps } = useModelCaps();
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const { copied, copy } = useCopyToClipboard();

  const fetchData = async () => {
    try {
      const [combosRes, providersRes, settingsRes] = await Promise.all([
        fetch("/api/combos"),
        fetch("/api/providers"),
        fetch("/api/settings"),
      ]);
      const combosData = await combosRes.json();
      const providersData = await providersRes.json();
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};

      // Only LLM combos here - webSearch/webFetch combos belong to media-providers/web
      if (combosRes.ok)
        setCombos((combosData.combos || []).filter((c) => !c.kind || c.kind === "llm"));
      if (providersRes.ok) {
        setActiveProviders(providersData.connections || []);
      }
      setComboStrategies(settingsData.comboStrategies || {});
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- mount-time data fetch, same as other dashboard pages */
  useEffect(() => {
    void fetchData();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreate = async (data: { name: string; models: string[] }) => {
    try {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setShowCreateModal(false);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create combo");
      }
    } catch (error) {
      console.log("Error creating combo:", error);
    }
  };

  const handleUpdate = async (id: string, data: { name: string; models: string[] }) => {
    try {
      const res = await fetch(`/api/combos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setEditingCombo(null);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update combo");
      }
    } catch (error) {
      console.log("Error updating combo:", error);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      title: "Delete Combo",
      message: "Delete this combo?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/combos/${id}`, { method: "DELETE" });
          if (res.ok) {
            setCombos(combos.filter((c) => c.id !== id));
          }
        } catch (error) {
          console.log("Error deleting combo:", error);
        }
      },
    });
  };

  // Merge a per-combo strategy patch into settings.comboStrategies. Passing an empty
  // patch (strategy back to default "fallback") drops the entry entirely.
  const handleSetComboStrategy = async (comboName: string, patch: Record<string, unknown>) => {
    try {
      const updated = { ...comboStrategies };
      const next = { ...(updated[comboName] || {}), ...patch };
      // Prune to keep settings clean: default fallback with no extras = no entry.
      if (!next.fallbackStrategy || next.fallbackStrategy === "fallback") {
        delete updated[comboName];
      } else {
        updated[comboName] = next;
      }

      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStrategies: updated }),
      });

      setComboStrategies(updated);
    } catch (error) {
      console.log("Error updating combo strategy:", error);
    }
  };

  if (loading) {
    return (
      <Page>
        <PanelSkeleton />
        <PanelSkeleton />
      </Page>
    );
  }

  return (
    <>
      <Page>
        <PageHeader
          title="Combos"
          description="Group models under one name, then pick a strategy per combo:"
          actions={
            <Button
              onClick={() => setShowCreateModal(true)}
              className="w-full whitespace-nowrap sm:w-auto"
            >
              <Plus />
              Create Combo
            </Button>
          }
        />
        <Section>
          <div className="min-w-0">
            <ul className="text-sm text-muted-foreground flex flex-col gap-1">
              <li>
                <span className="font-medium text-foreground">Fallback</span> — tries models in
                order (next on failure)
              </li>
              <li>
                <span className="font-medium text-foreground">Round Robin</span> — rotates models
                across requests to spread load
              </li>
              <li>
                <span className="font-medium text-foreground">Fusion</span> — queries all models in
                parallel, then a judge synthesizes one answer. Best quality, but costs the most:
                every request bills all panel models + the judge (N+1 calls)
              </li>
            </ul>
          </div>
        </Section>

        {/* Combos List */}
        <Section>
          {combos.length === 0 ? (
            <Card>
              <div className="py-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
                  <Layers className="size-8" />
                </div>
                <p className="text-foreground font-medium mb-1">No combos yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Create model combos with fallback support
                </p>
                <Button onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
                  <Plus />
                  Create Combo
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {combos.map((combo) => (
                <ComboCard
                  key={combo.id}
                  combo={combo}
                  getCaps={getCaps}
                  activeProviders={activeProviders}
                  copied={copied}
                  onCopy={copy}
                  onEdit={() => setEditingCombo(combo)}
                  onDelete={() => handleDelete(combo.id)}
                  strategy={comboStrategies[combo.name] || {}}
                  onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
                />
              ))}
            </div>
          )}
        </Section>
      </Page>

      {/* Create Modal - Use key to force remount and reset state */}
      {showCreateModal && (
        <ComboFormModal
          key="create"
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreate}
          activeProviders={activeProviders}
        />
      )}

      {editingCombo && (
        <ComboFormModal
          key={editingCombo.id}
          isOpen={!!editingCombo}
          combo={editingCombo}
          onClose={() => setEditingCombo(null)}
          onSave={(data) => handleUpdate(editingCombo.id, data)}
          activeProviders={activeProviders}
        />
      )}

      {/* Confirm Delete Modal */}
      {confirmState && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmState(null);
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{confirmState.title}</DialogTitle>
            </DialogHeader>
            <p className="p-4 text-sm text-muted-foreground">{confirmState.message}</p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmState(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmState.onConfirm}>
                {confirmState.confirmText || "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

const STRATEGY_OPTIONS = [
  { value: "fallback", label: "Fallback — try in order" },
  { value: "round-robin", label: "Round Robin — rotate" },
  { value: "fusion", label: "Fusion — panel + judge" },
];

function ComboCard({
  combo,
  getCaps,
  activeProviders = [],
  copied,
  onCopy,
  onEdit,
  onDelete,
  strategy = {},
  onSetStrategy,
}: {
  combo: Combo;
  getCaps: (key: string) => Record<string, unknown> | null;
  activeProviders?: ProviderConnection[];
  copied: string | null;
  onCopy: (combo: string, key: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  strategy: Record<string, unknown>;
  onSetStrategy: (patch: Record<string, unknown>) => void;
}) {
  const [showJudgeSelect, setShowJudgeSelect] = useState(false);
  const current = (strategy.fallbackStrategy as string) || "fallback";
  const judge = (strategy.judgeModel as string) || "";
  const isFusion = current === "fusion";

  return (
    <Card size="sm" className="group">
      <CardContent className="min-w-0">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Layers className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <code className="block truncate font-mono text-sm font-medium">{combo.name}</code>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                {combo.models.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">No models</span>
                ) : (
                  combo.models.slice(0, 3).map((model, index) => (
                    <code
                      key={index}
                      className="inline-flex items-center gap-1 rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs text-muted-foreground dark:bg-white/5"
                    >
                      <span>{model}</span>
                      <CapacityBadges caps={getCaps?.(model)} />
                    </code>
                  ))
                )}
                {combo.models.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{combo.models.length - 3} more
                  </span>
                )}
              </div>
              {/* Fusion: judge picker (Auto = first model) */}
              {isFusion && (
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Judge</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setShowJudgeSelect(true)}
                        className="inline-flex max-w-full items-center gap-1 rounded border border-dashed border-primary/40 px-1.5 py-0.5 font-mono text-[11px] text-primary hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <Gavel className="size-3.5" />
                        <span className="truncate">
                          {judge || `Auto — ${combo.models[0] || "first model"}`}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Pick the model that fuses panel answers</TooltipContent>
                  </Tooltip>
                  {judge && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onSetStrategy({ judgeModel: "" })}
                          className="p-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <X className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Reset judge to Auto</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3 sm:shrink-0">
            {/* Strategy selector — always visible */}
            <div className="w-full sm:w-[200px]">
              <Select
                value={current}
                onValueChange={(value) => onSetStrategy({ fallbackStrategy: value })}
              >
                <SelectTrigger className="py-1.5 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-1 sm:flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy(combo.name, `combo-${combo.id}`);
                    }}
                    aria-label="Copy combo name"
                  >
                    {copied === `combo-${combo.id}` ? <Check /> : <Copy />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy combo name</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit">
                    <Pencil />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onDelete}
                    aria-label="Delete"
                    className="text-red-500 hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Judge model picker (single-select; combo members make natural judges too) */}
      {showJudgeSelect && (
        <ModelSelectModal
          isOpen={showJudgeSelect}
          onClose={() => setShowJudgeSelect(false)}
          onSelect={(m: { value?: string }) => {
            onSetStrategy({ judgeModel: m?.value || "" });
            setShowJudgeSelect(false);
          }}
          activeProviders={activeProviders}
          title="Select Judge Model"
          addedModelValues={judge ? [judge] : []}
          closeOnSelect={true}
        />
      )}
    </Card>
  );
}

function ModelItem({
  id,
  index,
  model,
  isFirst,
  isLast,
  onEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  id: string;
  index: number;
  model: string;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (value: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    // no transition — prevents the CSS settle animation fighting React's re-render on drop
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(model);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== model) onEdit(trimmed);
    else setDraft(model);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setDraft(model);
      setEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 bg-black/[0.02] hover:bg-black/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.04] transition-colors ${isDragging ? "shadow-md ring-1 ring-primary/30" : ""}`}
    >
      {/* Drag handle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="cursor-grab touch-none p-0.5 rounded text-muted-foreground hover:text-primary active:cursor-grabbing shrink-0"
          >
            <GripVertical className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Drag to reorder</TooltipContent>
      </Tooltip>

      {/* Index badge */}
      <span className="text-[10px] font-medium text-muted-foreground w-3 text-center shrink-0">
        {index + 1}
      </span>

      {/* Inline editable model value */}
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

      {/* Priority arrows */}
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

      {/* Remove */}
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

function ComboFormModal({
  isOpen,
  combo,
  onClose,
  onSave,
  activeProviders,
  kindFilter = null,
}: {
  isOpen: boolean;
  combo?: { id: string; name: string; models: string[] } | null;
  onClose: () => void;
  onSave: (data: { name: string; models: string[] }) => void;
  activeProviders: ProviderConnection[];
  kindFilter?: string | null;
}) {
  // Initialize state with combo values - key prop on parent handles reset on remount
  const [name, setName] = useState(combo?.name || "");
  const [models, setModels] = useState<string[]>(combo?.models || []);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [modelAliases, setModelAliases] = useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Use stable index-based IDs so duplicates and similar names are handled correctly
  const modelItems = models.map((model, i) => ({ uid: `item-${i}`, model }));

  const handleDragEnd = (event: { active: { id: unknown }; over: { id: unknown } | null }) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = modelItems.findIndex((m) => m.uid === active.id);
      const newIndex = modelItems.findIndex((m) => m.uid === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        setModels((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  };

  const fetchModalData = async () => {
    try {
      const aliasesRes = await fetch("/api/models/alias");
      if (!aliasesRes.ok) return;
      const aliasesData = await aliasesRes.json();
      setModelAliases(aliasesData.aliases || {});
    } catch (error) {
      console.error("Error fetching modal data:", error);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- aliases fetched on modal open, same as other dashboard pages */
  useEffect(() => {
    if (isOpen) void fetchModalData();
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const validateName = (value: string) => {
    if (!value.trim()) {
      setNameError("Name is required");
      return false;
    }
    if (!VALID_NAME_REGEX.test(value)) {
      setNameError("Only letters, numbers, -, _ and . allowed");
      return false;
    }
    setNameError("");
    return true;
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setName(value);
    if (value) validateName(value);
    else setNameError("");
  };

  const handleAddModel = (model: { value: string }) => {
    if (!models.includes(model.value)) {
      setModels([...models, model.value]);
    }
  };

  const handleDeselectModel = (model: { value: string }) => {
    setModels(models.filter((m) => m !== model.value));
  };

  const handleRemoveModel = (index: number) => {
    setModels(models.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newModels = [...models];
    [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
    setModels(newModels);
  };

  const handleMoveDown = (index: number) => {
    if (index === models.length - 1) return;
    const newModels = [...models];
    [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
    setModels(newModels);
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    setSaving(true);
    await onSave({ name: name.trim(), models });
    setSaving(false);
  };

  const isEdit = !!combo;

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Combo" : "Create Combo"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 p-4">
            {/* Name */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Combo Name</label>
              <Input
                value={name}
                onChange={handleNameChange}
                placeholder="my-combo"
                aria-invalid={!!nameError}
                className={nameError ? "ring-1 ring-red-500 border-red-500/40" : ""}
              />
              {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Only letters, numbers, -, _ and . allowed
              </p>
            </div>

            {/* Models */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Models</label>

              {models.length === 0 ? (
                <div className="text-center py-4 border border-dashed border-black/10 dark:border-white/10 rounded-lg bg-black/[0.01] dark:bg-white/[0.01]">
                  <Layers className="mb-1 mx-auto size-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">No models added yet</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                >
                  <SortableContext
                    items={modelItems.map((m) => m.uid)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex max-h-[55vh] min-w-0 flex-col gap-1 overflow-y-auto sm:max-h-[350px]">
                      {modelItems.map(({ uid, model }, index) => (
                        <ModelItem
                          key={uid}
                          id={uid}
                          index={index}
                          model={model}
                          isFirst={index === 0}
                          isLast={index === modelItems.length - 1}
                          onEdit={(newVal) => {
                            const updated = [...models];
                            updated[index] = newVal;
                            setModels(updated);
                          }}
                          onMoveUp={() => handleMoveUp(index)}
                          onMoveDown={() => handleMoveDown(index)}
                          onRemove={() => handleRemoveModel(index)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {/* Add Model button */}
              <button
                onClick={() => setShowModelSelect(true)}
                className="w-full mt-2 py-2 border border-dashed border-black/10 dark:border-white/10 rounded-lg text-xs text-primary font-medium hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="size-4" />
                Add Model
              </button>
            </div>
          </div>

          {/* Actions */}
          <DialogFooter>
            <div className="flex w-full flex-col gap-2 pt-1 sm:flex-row">
              <Button
                onClick={handleSave}
                size="sm"
                className="flex-1"
                disabled={!name.trim() || !!nameError || saving}
              >
                {saving ? "Saving..." : isEdit ? "Save" : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Model Select Modal */}
      {showModelSelect && (
        <ModelSelectModal
          isOpen={showModelSelect}
          onClose={() => setShowModelSelect(false)}
          onSelect={handleAddModel}
          onDeselect={handleDeselectModel}
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
