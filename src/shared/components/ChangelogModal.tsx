"use client";
import Icon from "@/shared/components/Icon";

import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { marked } from "marked";
import { GITHUB_CONFIG } from "@/shared/constants/config";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

marked.setOptions({ gfm: true, breaks: true });

interface ChangelogModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function ChangelogModal({ isOpen, onClose }: ChangelogModalProps) {
  const [md, setMd] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || md) return;
    setLoading(true);
    setError("");
    fetch(GITHUB_CONFIG.changelogUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => setMd(text))
      .catch((err) => setError(err.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [isOpen, md]);

  // Versions are H2 (`## [x.y.z]`); H1 is only the file title — don't split on it
  const sections = md ? md.split(/(?=^## )/m).filter((s) => s.startsWith("## ")) : [];
  const visible = expanded ? sections : sections.slice(0, 3);
  const hiddenCount = sections.length - visible.length;
  const html = visible.length ? marked.parse(visible.join("\n")) : "";

  return (
    <Dialog open={!!isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Change Log</DialogTitle>
        </DialogHeader>
        <div className="max-h-[75vh] overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Icon name="progress_activity" className="animate-spin mr-2" />
              Loading...
            </div>
          )}
          {error && <div className="text-red-500 py-4">Failed to load changelog: {error}</div>}
          {!loading && !error && html && (
            <>
              <div
                className="changelog-body text-foreground"
                dangerouslySetInnerHTML={{ __html: html }}
              />
              {hiddenCount > 0 && (
                <button
                  onClick={() => setExpanded(true)}
                  className="mt-4 w-full py-2 rounded-lg text-sm font-medium text-foreground bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                >
                  Show {hiddenCount} more
                </button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

ChangelogModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
