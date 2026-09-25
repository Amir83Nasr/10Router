"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { translate } from "@/i18n/runtime";

const PLACEHOLDER = `[
  {
    "accessToken": "eyJhbGc...",
    "refreshToken": "rt_...",
    "idToken": "eyJhbGc...",
    "email": "user@example.com"
  }
]`;

function normalizeToArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.accounts)) return parsed.accounts;
    return [parsed];
  }
  return null;
}

export default function BulkImportCodexModal({ isOpen, onClose, onSuccess }: any) {
  const [jsonText, setJsonText] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string>("");
  const [result, setResult] = useState<any>(null);

  const handleClose = () => {
    if (submitting) return;
    setJsonText("");
    setParseError("");
    setResult(null);
    onClose();
  };

  const handleSubmit = async () => {
    setParseError("");
    setResult(null);

    const trimmed = jsonText.trim();
    if (!trimmed) return;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      setParseError(`${translate("Invalid JSON")}: ${err.message}`);
      return;
    }

    const accounts = normalizeToArray(parsed);
    if (!accounts || accounts.length === 0) {
      setParseError(translate("No accounts found in input"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/oauth/codex/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setParseError(data?.error || `Request failed: ${res.status}`);
        return;
      }
      setResult(data);
      if (data.success > 0 && typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (err) {
      setParseError(err.message || translate("Request failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const failedItems = result?.results?.filter((r) => !r.ok) || [];

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{translate("Bulk Add Codex Accounts")}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[calc(85vh-120px)] flex-col gap-4 overflow-y-auto p-4">
          <p className="text-xs text-muted-foreground">
            {translate(
              "Paste an array of codex account JSON objects. Each must include accessToken (and ideally refreshToken, idToken).",
            )}
          </p>

          <textarea
            className="w-full rounded border border-accent/30 bg-sidebar p-2 text-sm font-mono resize-y min-h-[240px] focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={PLACEHOLDER}
            value={jsonText}
            onChange={(e: any) => setJsonText(e.target.value)}
            disabled={submitting}
          />

          {parseError && <p className="text-xs text-red-500 break-words">{parseError}</p>}

          {result && (
            <div className="flex flex-col gap-2">
              <div
                className={`text-sm font-medium ${
                  result.failed > 0 ? "text-yellow-400" : "text-green-400"
                }`}
              >
                ✓ {result.success} {translate("added")}
                {result.failed > 0 ? `, ✗ ${result.failed} ${translate("failed")}` : ""}
              </div>
              {failedItems.length > 0 && (
                <ul className="rounded border border-accent/20 bg-sidebar/50 p-2 text-xs font-mono max-h-40 overflow-y-auto">
                  {failedItems.map((item) => (
                    <li key={item.index} className="text-red-400">
                      [{item.index}] {item.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleSubmit}
              className="w-full"
              disabled={submitting || !jsonText.trim()}
            >
              {submitting ? translate("Importing...") : translate("Import All")}
            </Button>
            <Button onClick={handleClose} variant="ghost" className="w-full" disabled={submitting}>
              {translate("Close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
