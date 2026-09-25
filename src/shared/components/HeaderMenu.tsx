"use client";
import Icon from "@/shared/components/Icon";

import { useState } from "react";
import PropTypes from "prop-types";
import ChangelogModal from "./ChangelogModal";
import { useShutdown } from "@/shared/hooks/useShutdown";
import ShutdownModal from "./ShutdownModal";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderMenuProps {
  onLogout?: any;
}

export default function HeaderMenu({ onLogout }: HeaderMenuProps) {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const shutdown = useShutdown();

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Settings menu">
                <Icon name="settings" className="size-5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>System</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setChangelogOpen(true)}>
            <Icon name="history" className="size-4 text-muted-foreground" />
            Change Log
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => shutdown.open()}>
            <Icon name="power_settings_new" className="size-4" />
            Shutdown
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onLogout()}>
            <Icon name="logout" className="size-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangelogModal isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <ShutdownModal
        isOpen={shutdown.confirmOpen || shutdown.stopped || shutdown.timedOut}
        onClose={shutdown.reset}
        onConfirm={shutdown.confirm}
        shuttingDown={shutdown.shuttingDown}
        stopped={shutdown.stopped}
        timedOut={shutdown.timedOut}
      />
    </>
  );
}

HeaderMenu.propTypes = {
  onLogout: PropTypes.func.isRequired,
};
