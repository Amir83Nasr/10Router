"use client";
import Icon from "@/shared/components/Icon";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import Header from "../Header";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";

type ToastType = "success" | "error" | "warning" | "info";

function getToastStyle(type: ToastType) {
  if (type === "success") {
    return {
      wrapper: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
      icon: "check_circle",
    };
  }
  if (type === "error") {
    return {
      wrapper: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
      icon: "error",
    };
  }
  if (type === "warning") {
    return {
      wrapper: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      icon: "warning",
    };
  }
  return {
    wrapper: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    icon: "info",
  };
}

function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const notifications = useNotificationStore((state: any) => state.notifications);
  const removeNotification = useNotificationStore((state: any) => state.removeNotification);
  const { toggleSidebar } = useSidebar();

  return (
    <>
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2">
        {notifications.map((n) => {
          const style = getToastStyle(n.type);
          return (
            <div
              key={n.id}
              className={`rounded-lg border px-3 py-2 shadow-lg backdrop-blur-sm ${style.wrapper}`}
            >
              <div className="flex items-start gap-2">
                <Icon name={style.icon} className="text-[18px] leading-5" />
                <div className="min-w-0 flex-1">
                  {n.title ? <p className="text-xs font-semibold mb-0.5">{n.title}</p> : null}
                  <p className="text-xs whitespace-pre-wrap break-words">{n.message}</p>
                </div>
                {n.dismissible ? (
                  <button
                    type="button"
                    onClick={() => removeNotification(n.id)}
                    className="text-current/70 hover:text-current"
                    aria-label="Dismiss notification"
                  >
                    <Icon name="close" className="text-[16px]" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* shadcn sidebar (desktop fixed, mobile sheet) */}
      <AppSidebar />

      {/* Main content */}
      <SidebarInset className="flex flex-col h-full min-w-0 relative transition-colors duration-300 isolate">
        <Header key={pathname} onMenuClick={toggleSidebar} />
        <div
          className={`dashboard-grid-bg flex-1 overflow-y-auto ${pathname === "/dashboard/basic-chat" ? "" : "p-6 lg:p-10"} ${pathname === "/dashboard/basic-chat" ? "flex flex-col overflow-hidden" : ""}`}
        >
          <div
            className={`${pathname === "/dashboard/basic-chat" ? "flex-1 w-full h-full flex flex-col" : "max-w-7xl mx-auto"}`}
          >
            {children}
          </div>
        </div>
      </SidebarInset>
    </>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <DashboardShell>{children}</DashboardShell>
      </div>
    </SidebarProvider>
  );
}
