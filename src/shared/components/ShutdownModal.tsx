"use client";

// ponytail: confirm → shutting-down → stopped/timeout states in one modal.
// Ceiling: if more flows need multi-state modals, generalize ConfirmModal
// instead of adding more one-offs here.

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "./Modal";

interface ShutdownModalProps {
  isOpen?: boolean;
  shuttingDown?: boolean;
  stopped?: boolean;
  timedOut?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
}

export default function ShutdownModal({
  isOpen,
  shuttingDown,
  stopped,
  timedOut,
  onClose,
  onConfirm,
}: ShutdownModalProps) {
  const running = shuttingDown && !stopped && !timedOut;

  const title = stopped ? "Server Stopped" : timedOut ? "Still Running" : "Close Proxy";
  const body = stopped
    ? "The proxy server has stopped. You can close this tab now."
    : timedOut
      ? "The server did not stop in time. It may need a manual stop (10router stop)."
      : "Are you sure you want to close the proxy server?";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      closeOnOverlay={!running}
      footer={
        stopped || timedOut ? (
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={running}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={running}>
              {running && <Loader2 className="animate-spin" />}
              {running ? "Stopping…" : "Close"}
            </Button>
          </>
        )
      }
    >
      <p className="text-muted-foreground">{body}</p>
    </Modal>
  );
}
