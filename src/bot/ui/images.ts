/**
 * Local image assets → grammY InputFile for rich-message media embedding.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InputFile } from "grammy";

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, "../../../assets/img");

const cache = new Map<string, Buffer>();

export function assetPath(name: string): string {
  return path.join(ASSETS, name);
}

export function hasAsset(name: string): boolean {
  return fs.existsSync(assetPath(name));
}

export function readAsset(name: string): Buffer {
  let buf = cache.get(name);
  if (!buf) {
    buf = fs.readFileSync(assetPath(name));
    cache.set(name, buf);
  }
  return buf;
}

export interface ScreenImage {
  /** filename in assets/img */
  file: string;
  /** id used in markdown tg://photo?id= link */
  id: string;
  /** markdown media block line */
  markdown: string;
  /** rich-message upload descriptor */
  media: unknown;
}

/** Build the media block + InputRichMessageMedia entry for one image. */
export function imageBlock(name: string, caption = ""): ScreenImage {
  const id = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    file: name,
    id,
    markdown: `![](tg://photo?id=${id}${caption ? ` "${caption}"` : ""})`,
    media: { id, media: { type: "photo", media: new InputFile(readAsset(name), name) } },
  };
}
