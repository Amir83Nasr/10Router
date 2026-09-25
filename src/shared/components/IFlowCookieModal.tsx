"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Loader2 } from "lucide-react";
import Modal from "./Modal";
import { Button } from "@/components/ui/button";

interface IFlowCookieModalProps {
  isOpen?: boolean;
  onSuccess?: any;
  onClose?: () => void;
}

/**
 * iFlow Cookie Authentication Modal
 * User pastes browser cookie to get fresh API key
 */
export default function IFlowCookieModal({ isOpen, onSuccess, onClose }: IFlowCookieModalProps) {
  const [cookie, setCookie] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!cookie.trim()) {
      setError("Please paste your cookie");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/iflow/cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: cookie.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCookie("");
    setError(null);
    setSuccess(false);
    onClose?.();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="iFlow Cookie Authentication"
      footer={undefined as any}
      className={undefined as any}
    >
      <div className="space-y-4">
        {success ? (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-lg font-medium text-foreground">Authentication Successful!</p>
            <p className="text-sm text-muted-foreground mt-2">Fresh API key obtained</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                To get a fresh API key, paste your browser cookie from{" "}
                <a
                  href="https://platform.iflow.cn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  platform.iflow.cn
                </a>
              </p>
              <div className="bg-secondary p-3 rounded-lg text-xs space-y-2">
                <p className="font-medium text-foreground">How to get cookie:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Open platform.iflow.cn in your browser</li>
                  <li>Login to your account</li>
                  <li>Open DevTools (F12) → Application/Storage → Cookies</li>
                  <li>Copy the entire cookie string (must include BXAuth)</li>
                  <li>Paste it below</li>
                </ol>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">Cookie String</label>
              <textarea
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
                placeholder="BXAuth=xxx; ..."
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                rows={4}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button onClick={handleSubmit} disabled={loading} className="w-full">
              {loading && <Loader2 className="animate-spin" />}
              Authenticate
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

IFlowCookieModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onSuccess: PropTypes.func,
  onClose: PropTypes.func,
};
