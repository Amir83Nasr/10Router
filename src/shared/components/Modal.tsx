"use client";

// ponytail: compat shell over stock shadcn Dialog. Keeps legacy
// isOpen/onClose/footer/size API (incl. closeOnOverlay/showTrafficLights
// props — traffic-light chrome dropped in favor of stock close button).
// Ceiling: migrate callers to Dialog/Content/Header/Title/Footer directly,
// then delete this file.

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const sizes = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-4xl",
};

interface ModalProps {
  isOpen?: any;
  onClose?: any;
  title?: any;
  children?: React.ReactNode;
  footer?: any;
  size?: any;
  closeOnOverlay?: boolean;
  showTrafficLights?: boolean;
  className?: string;
  [key: string]: any;
}

interface ConfirmModalProps extends ModalProps {
  onConfirm?: any;
  message?: any;
  confirmText?: any;
  cancelText?: any;
  variant?: any;
  loading?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnOverlay = true,
  className,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <Dialog
      open={!!isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={cn(sizes[size], className)}
        onPointerDownOutside={closeOnOverlay ? undefined : (e) => e.preventDefault()}
        onInteractOutside={closeOnOverlay ? undefined : (e) => e.preventDefault()}
      >
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        <div className="max-h-[calc(85vh-100px)] overflow-y-auto p-4">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
}: ConfirmModalProps) {
  const confirmVariant =
    variant === "danger" ? "destructive" : variant === "primary" ? "default" : variant;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-muted-foreground">{message}</p>
    </Modal>
  );
}
