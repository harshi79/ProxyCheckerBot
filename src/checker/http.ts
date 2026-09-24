/**
 * HTTP(S) proxy client + the shared "GET through a socket" routine.
 *
 * Two modes:
 *  - target http://  → the proxy fetches for us; we read its response.
 *  - target https:// → CONNECT tunnel, TLS wrap, then we fetch.
 */
import { Socket } from "node:net";
import { ProxyAuth, ProxyCheckError, tlsOver, tcpConnect, readExact } from "./socks.js";
import { TargetUrl } from "./types.js";
import type { CheckLimits } from "./socks.js";

interface RawResponse {
  status: number;
  head: Buffer; // first bytes of body
}

/**
 * Issue a GET to `target.url` over an already-connected socket to the target
 * (TLS-wrapped when the target is https) and capture status + body head.
 */
export async function getOverSocket(
  socket: Socket,
  target: TargetUrl,
  isHttps: boolean,
  deadlineMs: number,
  ua = "Mozilla/5.0 (compatible; YoriChecker/1.0)",
): Promise<RawResponse> {
  const u = new URL(target.url);
  const conn = isHttps ? await tlsOver(socket, u.hostname, deadlineMs) : socket;
  const path = u.pathname + u.search;
  const req =
    `GET ${path || "/"} HTTP/1.1\r\n` +
    `Host: ${u.host}\r\n` +
    `User-Agent: ${ua}\r\n` +
    `Accept: */*\r\n` +
    `Connection: close\r\n\r\n`;
  conn.write(req);
  return readResponse(conn, deadlineMs);
}

/** Read an HTTP response: headers + up to `maxBody` bytes of body. */
export function readResponse(
  conn: Socket,
  deadlineMs: number,
  maxBody = 4096,
  headersOnly = false,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let got = 0;
    let headerEnd = -1;
    let status = 0;
    const timer = setTimeout(() => {
      cleanup();
      reject(new ProxyCheckError("response timeout", "timeout"));
    }, deadlineMs);
    function cleanup() {
      clearTimeout(timer);
      conn.removeListener("data", onData);
      conn.removeListener("error", onErr);
      conn.removeListener("close", onClose);
    }
    const finalize = () => {
      const buf = Buffer.concat(chunks);
      resolve({ status, head: buf.subarray(headerEnd + 4, headerEnd + 4 + maxBody) });
    };
    const onData = (chunk: Buffer) => {
      got += chunk.length;
      chunks.push(chunk);
      if (headerEnd === -1) {
        const full = Buffer.concat(chunks);
        const idx = full.indexOf("\r\n\r\n");
        if (idx !== -1) {
          headerEnd = idx;
          const statusLine = full.subarray(0, full.indexOf("\r\n")).toString("utf8");
          const m = /HTTP\/\d\.\d (\d{3})/.exec(statusLine);
          status = m ? Number(m[1]) : 0;
          const headerText = full.subarray(0, headerEnd).toString("latin1");
          const lengthMatch = /(?:^|\r\n)content-length:\s*(\d+)/i.exec(headerText);
          const bodyLen = full.length - headerEnd - 4;
          if (headersOnly || status === 204 || status === 304 || lengthMatch?.[1] === "0") {
            cleanup();
            finalize();
            return;
          }
          if (bodyLen >= maxBody) {
            cleanup();
            finalize();
            conn.destroy();
          }
        }
      } else if (got - headerEnd - 4 >= maxBody) {
        cleanup();
        finalize();
        conn.destroy();
      }
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(new ProxyCheckError(`response failed: ${err.message}`, "connect"));
    };
    const onClose = () => {
      if (headerEnd !== -1) {
        cleanup();
        finalize();
      } else {
        cleanup();
        reject(new ProxyCheckError("connection closed before response", "connect"));
      }
    };
    conn.on("data", onData);
    conn.on("error", onErr);
    conn.once("close", onClose);
  });
}

/**
 * Check through an HTTP/HTTPS proxy.
 * Returns a connected socket for http targets is NOT needed — this does the
 * full GET and returns the raw response directly.
 */
export async function httpProxyCheck(
  proxy: { host: string; port: number } & ProxyAuth,
  target: TargetUrl,
  limits: CheckLimits,
): Promise<RawResponse> {
  const started = Date.now();
  const deadline = () => Math.max(1, limits.totalTimeoutMs - (Date.now() - started));
  const socket = await tcpConnect(proxy.host, proxy.port, limits.connectTimeoutMs);
  const u = new URL(target.url);
  const isHttps = u.protocol === "https:";
  const port = u.port ? Number(u.port) : isHttps ? 443 : 80;
  try {
    if (isHttps) {
      // CONNECT tunnel
      const auth = proxy.user
        ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.user}:${proxy.pass ?? ""}`).toString("base64")}\r\n`
        : "";
      socket.write(
        `CONNECT ${u.hostname}:${port} HTTP/1.1\r\n` +
          `Host: ${u.hostname}:${port}\r\n` +
          auth +
          `Proxy-Connection: keep-alive\r\n\r\n`,
      );
      const res = await readResponse(socket, deadline(), 1024, true);
      if (res.status < 200 || res.status >= 300) {
        throw new ProxyCheckError(`connect refused by proxy (HTTP ${res.status})`, "rejected");
      }
      return await getOverSocket(socket, target, true, deadline());
    }
    // Plain http target: proxy fetches for us.
    const path = u.pathname + u.search;
    const auth = proxy.user
      ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.user}:${proxy.pass ?? ""}`).toString("base64")}\r\n`
      : "";
    const req =
      `GET ${path || "/"} HTTP/1.1\r\n` +
      `Host: ${u.host}\r\n` +
      `User-Agent: Mozilla/5.0 (compatible; YoriChecker/1.0)\r\n` +
      `Accept: */*\r\n` +
      auth +
      `Proxy-Connection: close\r\n\r\n`;
    socket.write(req);
    return await readResponse(socket, deadline());
  } catch (err) {
    socket.destroy();
    throw err;
  }
}

/**
 * Direct (no proxy) GET — used for the engine's own egress IP probe.
 */
export async function directGet(url: string, timeoutMs: number): Promise<RawResponse> {
  const u = new URL(url);
  const isHttps = u.protocol === "https:";
  const port = u.port ? Number(u.port) : isHttps ? 443 : 80;
  const socket = await tcpConnect(u.hostname, port, timeoutMs);
  try {
    return await getOverSocket(
      socket,
      { display: url, url, hostname: u.hostname, port },
      isHttps,
      timeoutMs,
    );
  } catch (err) {
    socket.destroy();
    throw err;
  }
}
