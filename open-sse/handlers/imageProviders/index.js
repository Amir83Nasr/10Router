// Image provider adapter registry
import createOpenAIAdapter from "./openai.js";
import gemini from "./gemini.js";
import codex from "./codex.js";
import sdwebui from "./sdwebui.js";
import comfyui from "./comfyui.js";
import nanobanana from "./nanobanana.js";
import falAi from "./falAi.js";
import stabilityAi from "./stabilityAi.js";
import blackForestLabs from "./blackForestLabs.js";
import runwayml from "./runwayml.js";
import antigravity from "./antigravity.js";

const ADAPTERS = {
  openai: createOpenAIAdapter("openai"),
  openrouter: createOpenAIAdapter("openrouter"),
  recraft: createOpenAIAdapter("recraft"),
  xai: createOpenAIAdapter("xai"),
  gemini,
  codex,
  sdwebui,
  comfyui,
  nanobanana,
  antigravity,
  "fal-ai": falAi,
  "stability-ai": stabilityAi,
  "black-forest-labs": blackForestLabs,
  runwayml,
};

export function getImageAdapter(provider) {
  return ADAPTERS[provider] || null;
}

export function isImageProvider(provider) {
  return provider in ADAPTERS;
}
