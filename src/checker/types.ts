/** Core checker types. */

export type ProxyProto = "http" | "socks4" | "socks5" | "auto";

export interface ProxyEntry {
  /** Original line exactly as the user sent it (used for output files). */
  raw: string;
  /** Normalized host (IPv4/IPv6/domain). */
  host: string;
  port: number;
  proto: ProxyProto;
  user?: string;
  pass?: string;
}

export interface ParseResult {
  entries: ProxyEntry[];
  /** Counts by declared protocol (auto-detected lines count under their detection later; parse-time counts reflect what the line declared). */
  counts: { http: number; socks4: number; socks5: number; auto: number };
  rejected: number;
  totalLines: number;
}

export interface TargetUrl {
  /** As the user entered it. */
  display: string;
  /** Normalized absolute URL. */
  url: string;
  /** Hostname without port, as entered (for file naming). */
  hostname: string;
  /** Effective destination port (derived from URL when omitted). */
  port?: number;
}

export interface CheckOutcome {
  ok: boolean;
  /** HTTP status code delivered through the proxy, when ok. */
  status?: number;
  /** Round-trip ms. */
  ms: number;
  /** Detected protocol (only meaningful for `auto` entries). */
  detected?: Exclude<ProxyProto, "auto">;
  /** Exit IP when the target body is an IP (universal default) — for elite tagging. */
  exitIp?: string;
}

export interface JobStats {
  total: number;
  done: number;
  hits: number;
  startedAt: number;
}

export type ProgressListener = (stats: JobStats) => void;
