import crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Standalone sudo-password cache + encrypted persistence (Tailscale install/daemon).
// Ported from the removed MITM manager — no MITM coupling remains.

const ENCRYPT_ALGO = "aes-256-gcm";
const ENCRYPT_SALT = "10router-sudo-pwd";

let _getSettings = null;
let _updateSettings = null;

export function initSudoHooks(getSettingsFn, updateSettingsFn) {
  _getSettings = getSettingsFn;
  _updateSettings = updateSettingsFn;
}

export function getCachedPassword() {
  return globalThis.__sudoPassword || null;
}

export function setCachedPassword(pwd) {
  globalThis.__sudoPassword = pwd;
}

function deriveKey() {
  try {
    const { machineIdSync } = require("node-machine-id");
    const raw = machineIdSync();
    return crypto
      .createHash("sha256")
      .update(raw + ENCRYPT_SALT)
      .digest();
  } catch {
    return crypto.createHash("sha256").update(ENCRYPT_SALT).digest();
  }
}

function encryptPassword(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPT_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptPassword(stored) {
  try {
    const [ivHex, tagHex, dataHex] = stored.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ENCRYPT_ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(Buffer.from(dataHex, "hex")) + decipher.final("utf8");
  } catch {
    return null;
  }
}

export async function saveEncryptedPassword(password) {
  if (!_updateSettings || !password) return;
  try {
    await _updateSettings({ sudoEncrypted: encryptPassword(password) });
  } catch {
    /* ignore */
  }
}

export async function clearEncryptedPassword() {
  if (!_updateSettings) return;
  try {
    await _updateSettings({ sudoEncrypted: null });
  } catch {
    /* ignore */
  }
}

export async function loadEncryptedPassword() {
  if (!_getSettings) return null;
  try {
    const settings = await _getSettings();
    if (!settings.sudoEncrypted) return null;
    return decryptPassword(settings.sudoEncrypted);
  } catch {
    return null;
  }
}
