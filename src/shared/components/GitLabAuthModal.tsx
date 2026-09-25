"use client";
import Icon from "@/shared/components/Icon";

import { useState } from "react";
import PropTypes from "prop-types";
import { Loader2 } from "lucide-react";
import Modal from "./Modal";
import OAuthModal from "./OAuthModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const GITLAB_COM = "https://gitlab.com";

function getRedirectUri() {
  if (typeof window === "undefined") return "http://localhost/callback";
  const port = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
  return `http://localhost:${port}/callback`;
}

interface GitLabAuthModalProps {
  isOpen?: boolean;
  providerInfo?: any;
  onSuccess?: any;
  onClose?: () => void;
}

/**
 * GitLab Duo Authentication Modal
 * Supports two modes:
 * - OAuth (PKCE): requires OAuth App Client ID (and optional Client Secret)
 * - PAT: requires Personal Access Token
 */
export default function GitLabAuthModal({
  isOpen,
  providerInfo,
  onSuccess,
  onClose,
}: GitLabAuthModalProps) {
  const [mode, setMode] = useState(null); // null | "oauth" | "pat"
  const [baseUrl, setBaseUrl] = useState(GITLAB_COM);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [pat, setPat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showOAuth, setShowOAuth] = useState(false);
  const [oauthMeta, setOauthMeta] = useState(null);

  const reset = () => {
    setMode(null);
    setBaseUrl(GITLAB_COM);
    setClientId("");
    setClientSecret("");
    setPat("");
    setError(null);
    setLoading(false);
    setShowOAuth(false);
    setOauthMeta(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleOAuthStart = () => {
    if (!clientId.trim()) {
      setError("Client ID is required");
      return;
    }
    setError(null);
    setOauthMeta({
      baseUrl: baseUrl.trim() || GITLAB_COM,
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    });
    setShowOAuth(true);
  };

  const handlePATSubmit = async () => {
    if (!pat.trim()) {
      setError("Personal Access Token is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/oauth/gitlab/pat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pat.trim(), baseUrl: baseUrl.trim() || GITLAB_COM }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Sub-modal for OAuth PKCE flow
  if (showOAuth && oauthMeta) {
    return (
      <OAuthModal
        isOpen
        provider="gitlab"
        providerInfo={providerInfo}
        oauthMeta={oauthMeta}
        idcConfig={undefined as any}
        onSuccess={() => {
          onSuccess?.();
          handleClose();
        }}
        onClose={() => {
          setShowOAuth(false);
          setOauthMeta(null);
        }}
      />
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      title="Connect GitLab Duo"
      onClose={handleClose}
      size="lg"
      footer={undefined as any}
      className={undefined as any}
    >
      <div className="flex flex-col gap-4">
        {/* Mode selection */}
        {!mode && (
          <>
            <p className="text-sm text-muted-foreground">
              Choose how to authenticate with GitLab Duo:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode("oauth")}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <Icon name="lock_open" className="text-2xl text-primary" />
                <div>
                  <p className="text-sm font-medium">OAuth App</p>
                  <p className="text-xs text-muted-foreground">Use a GitLab OAuth application</p>
                </div>
              </button>
              <button
                onClick={() => setMode("pat")}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <Icon name="key" className="text-2xl text-primary" />
                <div>
                  <p className="text-sm font-medium">Personal Access Token</p>
                  <p className="text-xs text-muted-foreground">Use a GitLab PAT with api scope</p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* OAuth mode */}
        {mode === "oauth" && (
          <>
            <p className="text-xs text-muted-foreground">
              Create an OAuth app at{" "}
              <a
                href={`${baseUrl.trim() || GITLAB_COM}/-/profile/applications`}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                GitLab Applications
              </a>{" "}
              with redirect URI{" "}
              <code className="bg-sidebar px-1 rounded text-xs">{getRedirectUri()}</code>
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">GitLab Base URL</label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={GITLAB_COM}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Client ID</label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Your OAuth application client ID"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Client Secret (optional for PKCE)</label>
              <Input
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Leave empty for public PKCE app"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handleOAuthStart} className="w-full" disabled={!clientId.trim()}>
                Authorize
              </Button>
              <Button
                onClick={() => {
                  setMode(null);
                  setError(null);
                }}
                variant="ghost"
                className="w-full"
              >
                Back
              </Button>
            </div>
          </>
        )}

        {/* PAT mode */}
        {mode === "pat" && (
          <>
            <p className="text-xs text-muted-foreground">
              Create a PAT at{" "}
              <a
                href={`${baseUrl.trim() || GITLAB_COM}/-/user_settings/personal_access_tokens`}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                GitLab Access Tokens
              </a>{" "}
              with scopes: <code className="bg-sidebar px-1 rounded text-xs">api</code>,{" "}
              <code className="bg-sidebar px-1 rounded text-xs">read_user</code>, and{" "}
              <code className="bg-sidebar px-1 rounded text-xs">ai_features</code>.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">GitLab Base URL</label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={GITLAB_COM}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Personal Access Token</label>
              <Input
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                type="password"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button
                onClick={handlePATSubmit}
                className="w-full"
                disabled={!pat.trim() || loading}
              >
                {loading && <Loader2 className="animate-spin" />}
                Connect
              </Button>
              <Button
                onClick={() => {
                  setMode(null);
                  setError(null);
                }}
                variant="ghost"
                className="w-full"
              >
                Back
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

GitLabAuthModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  providerInfo: PropTypes.shape({ name: PropTypes.string }),
  onSuccess: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
