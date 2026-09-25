"use client";
import Icon from "@/shared/components/Icon";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: "terminal", label: "Terminal", desc: "Full shell access" },
  { icon: "cast", label: "Desktop", desc: "Screen sharing" },
  { icon: "folder_open", label: "Files", desc: "Browse & edit files" },
];

const BULLETS = [
  { icon: "qr_code_scanner", text: "Scan QR to connect instantly" },
  { icon: "wifi_off", text: "No port forwarding needed" },
  { icon: "devices", text: "Works on any device" },
];

const NINE_REMOTE_URL = "https://9remote.cc";

interface NineRemotePromoModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  [key: string]: any;
}

export default function NineRemotePromoModal({ isOpen, onClose }: NineRemotePromoModalProps) {
  return (
    <Dialog open={!!isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="sm:max-w-sm p-0">
        <DialogTitle className="sr-only">9Remote</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border pr-14">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-[8px] flex items-center justify-center bg-primary">
              <Icon name="terminal" className="text-white text-base" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary font-mono">
              9Remote
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-7 pb-7 flex flex-col gap-6">
          {/* Hero */}
          <div className="flex flex-col items-center gap-2 text-center mt-2">
            <div className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-1 bg-primary shadow-md">
              <Icon name="terminal" className="text-white text-[30px]" />
            </div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">9Remote</h1>
            <p className="text-xs text-muted-foreground leading-5 max-w-55">
              Access your terminal, desktop &amp; files from anywhere
            </p>
          </div>

          {/* Feature cards */}
          <div className="flex gap-2 w-full">
            {FEATURES.map(({ icon, label, desc }) => (
              <div
                key={label}
                className="flex-1 flex flex-col items-center gap-1.5 py-4 px-1 rounded-[10px] border border-border bg-muted"
              >
                <Icon name={icon} className="text-primary text-[22px]" />
                <p className="text-xs font-semibold text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground text-center leading-4">{desc}</p>
              </div>
            ))}
          </div>

          {/* Bullets */}
          <div className="flex flex-col gap-3 w-full">
            {BULLETS.map(({ icon, text }) => (
              <div key={icon} className="flex items-center gap-2.5">
                <Icon name={icon} className="shrink-0 text-primary text-[16px]" />
                <span className="text-xs text-muted-foreground">{text}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Button className="w-full" onClick={() => window.open(NINE_REMOTE_URL, "_blank")}>
            <Icon name="open_in_new" className="text-base" />
            Get 9Remote
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
