/** File download helper (works with custom API_BASE_URL). */
import { config } from "../config.js";

export async function downloadFile(fileId: string, maxBytes: number): Promise<Buffer> {
  const api = new URL(config.apiBaseUrl.endsWith("/") ? config.apiBaseUrl : config.apiBaseUrl + "/");
  // we don't have a Bot instance here; token-based URL
  throwIfNoToken();
  const info = await apiCall<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!info.file_path) throw new Error("file unavailable (too large?)");
  const url = `${api.origin}/file/bot${config.botToken}/${info.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error("file too big");
  return buf;
}

function throwIfNoToken(): void {
  if (!config.botToken) throw new Error("BOT_TOKEN not configured");
}

/** Minimal raw API call (kept dependency-free for utility context). */
async function apiCall<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const url = `${config.apiBaseUrl.replace(/\/$/, "")}/bot${config.botToken}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!body.ok) throw new Error(body.description ?? `api ${method} failed`);
  return body.result;
}
