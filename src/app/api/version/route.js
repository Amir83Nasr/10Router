import pkg from "../../../../package.json" with { type: "json" };
import { getLatestVersion, isNewerVersion } from "@/lib/versionCheck";

export async function GET() {
  const currentVersion = pkg.version;
  // Fail-open: GitHub unreachable → latestVersion falls back to current.
  const { version, reason } = await getLatestVersion();
  const latestVersion = version || currentVersion;
  return Response.json({
    currentVersion,
    latestVersion,
    hasUpdate: isNewerVersion(latestVersion, currentVersion),
    source: reason,
  });
}
