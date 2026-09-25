"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";
import Icon from "@/shared/components/Icon";
import VersionLabel from "@/shared/components/VersionLabel";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: string;
  match?: (pathname: string) => boolean;
}

const NAV: NavItem[] = [
  {
    id: "endpoint",
    href: "/dashboard",
    label: "Endpoint & Key",
    icon: "api",
    match: (p) => p === "/dashboard" || p.startsWith("/dashboard/endpoint"),
  },
  { id: "providers", href: "/dashboard/providers", label: "Providers", icon: "dns" },
  { id: "combos", href: "/dashboard/combos", label: "Combo", icon: "layers" },
  { id: "usage", href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { id: "token-saver", href: "/dashboard/token-saver", label: "Token Saver", icon: "scissors" },
  { id: "cli-tools", href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
  {
    id: "systemone",
    href: "/dashboard/media-providers/systemone",
    label: "System One",
    icon: "bolt",
  },
];

const SYSTEM: NavItem[] = [
  { id: "proxy-pools", href: "/dashboard/proxy-pools", label: "Proxy Pools", icon: "waypoints" },
];

const MISC: NavItem[] = [
  { id: "profile", href: "/dashboard/profile", label: "Settings", icon: "settings" },
];

function isActive(pathname: string, item: NavItem) {
  if (item.match) return item.match(pathname);
  if (item.href === "/dashboard/profile") return pathname === "/dashboard/profile";
  return pathname.startsWith(item.href);
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = isActive(pathname, item);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
        <Link href={item.href} className="gap-3">
          <Icon name={item.icon} className="text-[18px]" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ ...props }: any) {
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar {...props}>
      <SidebarHeader className="h-20 justify-center border-b border-sidebar-border px-4">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
          <Image
            src="/icons/icon.svg"
            alt="10Router logo"
            width={36}
            height={36}
            className="size-9 rounded-[10px] shrink-0"
          />
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-lg font-semibold tracking-tight text-foreground">
                {APP_CONFIG.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">v{APP_CONFIG.version}</span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.map((item) => (
              <NavLink key={item.id} item={item} />
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarMenu>
            {SYSTEM.map((item) => (
              <NavLink key={item.id} item={item} />
            ))}
            {MISC.map((item) => (
              <NavLink key={item.id} item={item} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <VersionLabel collapsed={collapsed} />
      </SidebarFooter>
    </Sidebar>
  );
}
