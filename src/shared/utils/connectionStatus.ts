export function getStatusVariant(
  isActive: boolean | undefined,
  effectiveStatus?: string,
): "default" | "success" | "error" {
  if (isActive === false) return "default";
  if (effectiveStatus === "active" || effectiveStatus === "success") return "success";
  if (
    effectiveStatus === "error" ||
    effectiveStatus === "expired" ||
    effectiveStatus === "unavailable"
  )
    return "error";
  return "default";
}
