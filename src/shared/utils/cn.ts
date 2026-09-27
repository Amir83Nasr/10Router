// Utility: merge class names (cn package = clsx + tailwind-merge).
import { cn as cnMerge, type ClassValue } from "cn";

export function cn(...inputs: ClassValue[]): string {
  return cnMerge(...inputs);
}
