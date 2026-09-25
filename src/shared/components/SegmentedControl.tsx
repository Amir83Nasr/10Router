"use client";
import Icon from "@/shared/components/Icon";

// ponytail: thin compat wrapper over shadcn ui/tabs. Ceiling: migrate
// pages to Tabs/TabsList/TabsTrigger directly, then delete this file.

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/shared/utils/cn";

const AnyTabsList: any = TabsList;

interface SegmentedControlProps {
  options?: any;
  value?: any;
  onChange?: any;
  size?: any;
  className?: string;
}

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  className,
}: SegmentedControlProps) {
  const sizes: any = {
    sm: "h-7 text-xs",
    md: "h-9 text-sm",
    lg: "h-11 text-base",
  };

  return (
    <Tabs value={value} onValueChange={onChange} className={cn("overflow-x-auto", className)}>
      <AnyTabsList>
        {options.map((option: any) => (
          <TabsTrigger key={option.value} value={option.value} className={sizes[size]}>
            {option.icon && <Icon name={option.icon} className="text-[16px] mr-1.5" />}
            {option.label}
          </TabsTrigger>
        ))}
      </AnyTabsList>
    </Tabs>
  );
}
