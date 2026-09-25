import { AntigravityExecutor } from "./antigravity.js";
import { CodexExecutor } from "./codex.js";
import { CursorExecutor } from "./cursor.js";
import { OpenCodeExecutor } from "./opencode.js";
import { OpenCodeGoExecutor } from "./opencode-go.js";
import { OpenCodeZenExecutor } from "./opencode-zen.js";
import { XiaomiMimoExecutor } from "./xiaomi-mimo.js";
import { XiaomiTokenplanExecutor } from "./xiaomi-tokenplan.js";
import { QoderExecutor } from "./qoder.js";
import ZedExecutor from "./zed.js";
import { DefaultExecutor } from "./default.js";

const executors = {
  antigravity: new AntigravityExecutor(),
  codex: new CodexExecutor(),
  cursor: new CursorExecutor(),
  cu: new CursorExecutor(), // Alias for cursor
  opencode: new OpenCodeExecutor(),
  "opencode-go": new OpenCodeGoExecutor(),
  "opencode-zen": new OpenCodeZenExecutor(),
  "xiaomi-mimo": new XiaomiMimoExecutor(),
  "xiaomi-tokenplan": new XiaomiTokenplanExecutor(),
  qoder: new QoderExecutor(),
  zed: new ZedExecutor(),
};

const defaultCache = new Map();

export function getExecutor(provider) {
  if (executors[provider]) return executors[provider];
  if (!defaultCache.has(provider)) defaultCache.set(provider, new DefaultExecutor(provider));
  return defaultCache.get(provider);
}

export function hasSpecializedExecutor(provider) {
  return !!executors[provider];
}

export { BaseExecutor } from "./base.js";
export { AntigravityExecutor } from "./antigravity.js";
export { CodexExecutor } from "./codex.js";
export { CursorExecutor } from "./cursor.js";
export { DefaultExecutor } from "./default.js";
export { OpenCodeExecutor } from "./opencode.js";
export { OpenCodeGoExecutor } from "./opencode-go.js";
export { OpenCodeZenExecutor } from "./opencode-zen.js";
export { XiaomiMimoExecutor } from "./xiaomi-mimo.js";
export { XiaomiTokenplanExecutor } from "./xiaomi-tokenplan.js";
export { QoderExecutor } from "./qoder.js";
export { default as ZedExecutor } from "./zed.js";
