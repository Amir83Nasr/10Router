"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Modal from "./Modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

// Dual-mode modal: edit when `node` provided, add otherwise
interface AddCustomEmbeddingModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onCreated?: any;
  onSaved?: any;
  node?: any;
}

export default function AddCustomEmbeddingModal({
  isOpen,
  onClose,
  onCreated,
  onSaved,
  node,
}: AddCustomEmbeddingModalProps) {
  const isEdit = !!node;
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    baseUrl: DEFAULT_BASE_URL,
  });
  const [submitting, setSubmitting] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setValidationResult(null);
    setCheckKey("");
    setCheckModelId("");
    if (isEdit) {
      setFormData({
        name: node.name || "",
        prefix: node.prefix || "",
        baseUrl: node.baseUrl || DEFAULT_BASE_URL,
      });
    } else {
      setFormData({ name: "", prefix: "", baseUrl: DEFAULT_BASE_URL });
    }
  }, [isOpen, isEdit, node]);

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/provider-nodes/${node.id}` : "/api/provider-nodes";
      const method = isEdit ? "PUT" : "POST";
      const payload: any = {
        name: formData.name,
        prefix: formData.prefix,
        baseUrl: formData.baseUrl,
      };
      if (!isEdit) payload.type = "custom-embedding";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        if (isEdit) onSaved?.(data.node);
        else onCreated?.(data.node);
      }
    } catch (error) {
      console.log("Error saving custom embedding node:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: checkKey,
          type: "custom-embedding",
          modelId: checkModelId.trim() || undefined,
        }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: "Network error" });
    } finally {
      setValidating(false);
    }
  };

  const renderValidationResult = () => {
    if (!validationResult) return null;
    const { valid, error, dimensions } = validationResult;
    if (valid) {
      return (
        <>
          <Badge variant="default">Valid</Badge>
          {dimensions && <span className="text-sm text-muted-foreground">{dimensions} dims</span>}
        </>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="destructive">Invalid</Badge>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      title={isEdit ? "Edit Custom Embedding" : "Add Custom Embedding"}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Name</label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Voyage AI"
          />
          <p className="text-xs text-muted-foreground">
            Required. A friendly label for this embedding provider.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Prefix</label>
          <Input
            value={formData.prefix}
            onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
            placeholder="voyage"
          />
          <p className="text-xs text-muted-foreground">
            Required. Used as the provider prefix for model IDs (e.g. voyage/voyage-3).
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Base URL</label>
          <Input
            value={formData.baseUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            placeholder="https://api.voyageai.com/v1"
          />
          <p className="text-xs text-muted-foreground">
            Most embedding APIs are OpenAI-compatible: Voyage, Cohere, Jina, Mistral, Together...
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">API Key (for Check)</label>
          <Input type="password" value={checkKey} onChange={(e) => setCheckKey(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Model ID (for Check)</label>
          <Input
            value={checkModelId}
            onChange={(e) => setCheckModelId(e.target.value)}
            placeholder="e.g. voyage-3, embed-english-v3.0, text-embedding-3-small"
          />
          <p className="text-xs text-muted-foreground">
            Required for validation. Will send a test embeddings request.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleValidate}
            disabled={!checkKey || !checkModelId.trim() || validating || !formData.baseUrl.trim()}
            variant="secondary"
          >
            {validating ? "Checking..." : "Check"}
          </Button>
          {renderValidationResult()}
        </div>
        <Button
          onClick={handleSubmit}
          className="w-full"
          disabled={
            !formData.name.trim() ||
            !formData.prefix.trim() ||
            !formData.baseUrl.trim() ||
            submitting
          }
        >
          {submitting ? (isEdit ? "Saving..." : "Creating...") : isEdit ? "Save" : "Create"}
        </Button>
      </div>
    </Modal>
  );
}

AddCustomEmbeddingModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func,
  onSaved: PropTypes.func,
  node: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    prefix: PropTypes.string,
    baseUrl: PropTypes.string,
  }),
};
