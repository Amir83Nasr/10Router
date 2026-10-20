import { handleChat } from "@/sse/handlers/chat.js";
import { getApiKeys, createApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";

export const dynamic = "force-dynamic";

// The browser only holds the dashboard JWT. The LLM handler still enforces
// requireApiKey, so reuse (or mint) a local key server-side; it never reaches the client.
async function getInternalApiKey(): Promise<string> {
  const keys = await getApiKeys();
  const active = keys.find((k) => k.isActive !== false);
  if (active) return active.key;
  const created = await createApiKey("Default Key", await getConsistentMachineId());
  return created.key;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = await getInternalApiKey();
  } catch {
    return Response.json({ error: "Failed to prepare API key" }, { status: 500 });
  }

  // Only the body matters here; forwarding the browser's headers would also hand
  // cookies/origin to upstream executors that read rawHeaders.
  const upstreamRequest = new Request(request.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });

  return handleChat(upstreamRequest);
}
