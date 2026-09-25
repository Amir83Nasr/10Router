"use client";
import Icon from "@/shared/components/Icon";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import PropTypes from "prop-types";
import ProviderIcon from "@/shared/components/ProviderIcon";
import HeaderMenu from "@/shared/components/HeaderMenu";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { translate } from "@/i18n/runtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const getPageInfo = (pathname) => {
  if (!pathname) return { title: "", description: "", breadcrumbs: [] };

  // Provider detail page: /dashboard/providers/[id]
  const providerMatch = pathname.match(/\/providers\/([^/]+)$/);
  if (providerMatch) {
    const providerId = providerMatch[1];
    const providerInfo = OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId];
    if (providerInfo) {
      return {
        title: providerInfo.name,
        description: "",
        breadcrumbs: [
          { label: "Providers", href: "/dashboard/providers" },
          {
            label: providerInfo.name,
            image: getProviderIconSrc(providerInfo.id),
          },
        ],
      };
    }
  }

  // System One provider detail: /dashboard/media-providers/systemone/[id]
  const systemOneMatch = pathname.match(/\/media-providers\/systemone\/([^/]+)$/);
  if (systemOneMatch) {
    const rawId = decodeURIComponent(systemOneMatch[1]);
    const providerInfo =
      AI_PROVIDERS[rawId] || Object.values(AI_PROVIDERS).find((p: any) => p.alias === rawId);
    if (providerInfo) {
      return {
        title: providerInfo.name,
        description: "",
        breadcrumbs: [
          { label: "System One", href: "/dashboard/media-providers/systemone" },
          {
            label: providerInfo.name,
            image: getProviderIconSrc(providerInfo.id),
          },
        ],
      };
    }
  }

  // CLI tool detail: /dashboard/cli-tools/[toolId]
  const cliToolMatch = pathname.match(/\/cli-tools\/([^/]+)$/);
  if (cliToolMatch) {
    const rawId = decodeURIComponent(cliToolMatch[1]);
    const toolInfo = (CLI_TOOLS as Record<string, any>)[rawId];
    if (toolInfo) {
      return {
        title: toolInfo.name,
        description: "",
        breadcrumbs: [
          { label: "CLI Tools", href: "/dashboard/cli-tools" },
          {
            label: toolInfo.name,
            image: toolInfo.image,
          },
        ],
      };
    }
  }

  if (pathname.includes("/media-providers/systemone"))
    return {
      title: "System One",
      description: "Decision models — native POST /v1/systemone endpoint",
      icon: "bolt",
      breadcrumbs: [],
    };

  if (pathname.includes("/providers"))
    return {
      title: "Providers",
      description: "Manage your AI provider connections",
      icon: "dns",
      breadcrumbs: [],
    };
  if (pathname.includes("/combos"))
    return {
      title: "Combos",
      description: "Model combos with fallback",
      icon: "layers",
      breadcrumbs: [],
    };
  if (pathname.includes("/usage"))
    return {
      title: "Usage & Analytics",
      description: "Monitor your API usage, token consumption, and request logs",
      icon: "bar_chart",
      breadcrumbs: [],
    };
  if (pathname.includes("/auth-files"))
    return {
      title: "Auth Files",
      description: "Map provider credentials stored in the local database",
      icon: "vpn_key",
      breadcrumbs: [],
    };
  if (pathname.includes("/quota"))
    return {
      title: "Quota Tracker",
      description: "Track and manage your API quota limits",
      icon: "data_usage",
      breadcrumbs: [],
    };
  if (pathname.includes("/token-saver"))
    return {
      title: "Token Saver",
      description: "Compress prompts and outputs to save tokens",
      icon: "scissors",
      breadcrumbs: [],
    };
  if (pathname.includes("/cli-tools"))
    return {
      title: "CLI Tools",
      description: "Configure CLI tools",
      icon: "terminal",
      breadcrumbs: [],
    };
  if (pathname.includes("/proxy-pools"))
    return {
      title: "Proxy Pools",
      description: "Manage your proxy pool configurations",
      icon: "waypoints",
      breadcrumbs: [],
    };
  if (pathname.includes("/endpoint"))
    return {
      title: "Endpoint",
      description: "API endpoint configuration",
      icon: "api",
      breadcrumbs: [],
    };
  if (pathname.includes("/profile"))
    return {
      title: "Settings",
      description: "Manage your preferences",
      icon: "settings",
      breadcrumbs: [],
    };
  if (pathname.includes("/console-log"))
    return {
      title: "Console Log",
      description: "Live server console output",
      icon: "monitor",
      breadcrumbs: [],
    };
  if (pathname === "/dashboard")
    return {
      title: "Endpoint",
      description: "API endpoint configuration",
      icon: "api",
      breadcrumbs: [],
    };
  return { title: "", description: "", breadcrumbs: [] };
};

interface HeaderProps {
  onMenuClick?: any;
  showMenuButton?: boolean;
}

export default function Header({ onMenuClick, showMenuButton = true }: HeaderProps) {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState("");
  const [loginMethod, setLoginMethod] = useState("");

  // Memoize page info to prevent unnecessary recalculations
  const pageInfo = useMemo(() => getPageInfo(pathname), [pathname]);
  const { title, description, icon, breadcrumbs } = pageInfo;

  useEffect(() => {
    let cancelled = false;

    async function loadAuthStatus() {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setDisplayName(
            data?.displayName ||
              data?.samlName ||
              data?.samlEmail ||
              data?.oidcName ||
              data?.oidcEmail ||
              "",
          );
          setLoginMethod(data?.loginMethod || "");
        }
      } catch {
        if (!cancelled) {
          setDisplayName("");
          setLoginMethod("");
        }
      }
    }

    loadAuthStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        window.location.assign("/login");
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  return (
    <header className="sticky top-0 flex h-20 shrink-0 items-center justify-between gap-3 px-4 lg:px-8 border-b border-border bg-card/60 backdrop-blur-xl lg:bg-transparent lg:backdrop-blur-none z-20">
      {/* Mobile menu button */}
      <div className="flex items-center gap-3 lg:hidden shrink-0">
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            className="text-foreground hover:text-primary transition-colors"
          >
            <Icon name="menu" className="" />
          </button>
        )}
      </div>

      {/* Page title with breadcrumbs */}
      <div className="flex flex-col min-w-0 flex-1">
        {breadcrumbs.length > 0 ? (
          <div className="flex items-center gap-2">
            {breadcrumbs.map((crumb, index) => (
              <div
                key={`${crumb.label}-${crumb.href || "current"}`}
                className="flex items-center gap-2"
              >
                {index > 0 && (
                  <Icon name="chevron_right" className="text-muted-foreground text-base" />
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">
                    {crumb.image && (
                      <ProviderIcon
                        src={crumb.image}
                        alt={crumb.label}
                        size={28}
                        className="object-contain rounded max-w-[28px] max-h-[28px]"
                        fallbackText={crumb.label.slice(0, 2).toUpperCase()}
                      />
                    )}
                    <h1 className="text-base lg:text-2xl font-semibold text-foreground tracking-tight truncate">
                      {translate(crumb.label)}
                    </h1>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : title ? (
          <div>
            <div className="flex items-center gap-2">
              {icon && <Icon name={icon} className="text-primary text-xl lg:text-2xl" />}
              <h1 className="text-base lg:text-2xl font-semibold tracking-tight truncate">
                {translate(title)}
              </h1>
            </div>
            {description && (
              <p className="hidden lg:block text-sm text-muted-foreground truncate">
                {translate(description)}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 shrink-0">
        {displayName && (loginMethod === "OIDC" || loginMethod === "SAML") && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="hidden max-w-55 sm:inline-flex">
                <Icon name="person" className="size-3.5 text-primary" />
                <span className="truncate">{displayName}</span>
                <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {loginMethod}
                </span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{displayName}</TooltipContent>
          </Tooltip>
        )}
        <HeaderSearch />
        <HeaderMenu onLogout={handleLogout} />
      </div>
    </header>
  );
}

function HeaderSearch() {
  const visible = useHeaderSearchStore((s) => s.visible);
  const query = useHeaderSearchStore((s) => s.query);
  const placeholder = useHeaderSearchStore((s) => s.placeholder);
  const setQuery = useHeaderSearchStore((s) => s.setQuery);

  if (!visible) return null;

  return (
    <div className="relative w-40 sm:w-55">
      <Icon
        name="search"
        className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground size-4 pointer-events-none"
      />
      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-7 pr-7"
      />
      {query && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => setQuery("")}
          className="absolute right-1 top-1/2 -translate-y-1/2"
          aria-label="Clear search"
        >
          <Icon name="close" className="size-4" />
        </Button>
      )}
    </div>
  );
}

Header.propTypes = {
  onMenuClick: PropTypes.func,
  showMenuButton: PropTypes.bool,
};
