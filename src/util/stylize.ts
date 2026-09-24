/**
 * Stylize — the bot's signature small-caps font engine.
 *
 * Only transforms what it is explicitly given:
 *   - lowercase a-z → small-caps glyphs (U+1D00 block etc.)
 *   - digits → superscripts (opt-in)
 *   - everything else (uppercase, symbols, spaces, emoji) passes through.
 *
 * IMPORTANT: never stylize user content that must stay copy-pasteable
 * (URLs, proxy lines, file names) — pass those raw.
 */

const SMALL_CAPS: Readonly<Record<string, string>> = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ", h: "ʜ",
  i: "ɪ", j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ",
  q: "ꜱ", r: "ʀ", s: "ꜱ", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x",
  y: "ʏ", z: "ᴢ",
};

const SUPERScript_DIGITS: Readonly<Record<string, string>> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

export interface StylizeOptions {
  /** Convert 0-9 to superscript digits. Default: true (the house style). */
  digits?: boolean;
}

export function stylize(input: string, opts: StylizeOptions = {}): string {
  const digits = opts.digits ?? true;
  let out = "";
  for (const ch of input) {
    if (ch >= "a" && ch <= "z") out += SMALL_CAPS[ch] ?? ch;
    else if (digits && ch >= "0" && ch <= "9") out += SUPERScript_DIGITS[ch] ?? ch;
    else out += ch;
  }
  return out;
}

/**
 * House-style header: **↯ text ↯** with stylized text.
 * Returns plain string; templates wrap in rich/plain markup as needed.
 */
export function header(label: string): string {
  return `↯ ${stylize(label)} ↯`;
}

/** Format a byte count in the house style, e.g. 4.2 ᴍʙ. */
export function humanBytes(bytes: number): string {
  const units = ["ʙ", "ᴋʙ", "ᴍʙ", "ɢʙ"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = unit === 0 || value >= 100 ? Math.round(value).toString() : value.toFixed(1);
  return `${shown} ${units[unit]}`;
}

/** Format ms as mm:ss. */
export function humanMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Group digits with thin separators: 52341 → 52 341 */
export function groupNum(n: number): string {
  return n.toLocaleString("en-US").replace(/,/g, " ");
}
