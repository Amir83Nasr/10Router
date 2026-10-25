import { getProviderModels } from "../config/providerModels.js";
import { OPENCODE_GO_ENDPOINTS } from "../config/opencodeGo.js";
import { OpenCodeGoExecutor } from "../executors/opencode-go.js";
import { resolveTransport } from "./provider.js";

const OPENCODE_GO = "opencode-go";

// Connection probe for one OpenCode Go endpoint. The transport, URL, auth and the
// x-opencode-session header come from the executor, so the probe sends what real
// traffic sends. A hand-built request to /inference/go/* is rejected with MissingSessionID.
export function buildOpenCodeGoProbe(apiKey, format = "openai") {
  const transport = resolveTransport(OPENCODE_GO, format);
  const model = getProviderModels(OPENCODE_GO).find((m) =>
    m.supportedFormats?.includes(format),
  )?.id;
  if (!transport || !model) throw new Error(`OpenCode Go has no ${format} endpoint`);

  const executor = new OpenCodeGoExecutor();
  const credentials = executor.prepareRequestCredentials({
    credentials: { apiKey, runtimeTransport: transport },
  });
  const url = executor.buildUrl(model, false, 0, credentials);

  return {
    url,
    headers: executor.buildHeaders(credentials, false, url, model),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      stream: false,
    }),
  };
}

// One probe per endpoint in OPENCODE_GO_ENDPOINTS.
export function buildOpenCodeGoProbes(apiKey) {
  return OPENCODE_GO_ENDPOINTS.map(({ format }) => buildOpenCodeGoProbe(apiKey, format));
}
