/**
 * SOCKS4 / SOCKS5 clients (raw TCP, no dependencies).
 * Both return a connected TCP socket to the target, ready for a plain HTTP GET
 * (or a TLS wrap for https targets — done by the caller via `tlsOver`).
 */
import net from "node:net";
import tls from "node:tls";
import { Socket } from "node:net";
import type { TargetUrl } from "./types.js";

export interface ProxyAuth {
  user?: string;
  pass?: string;
}

export interface CheckLimits {
  connectTimeoutMs: number;
  totalTimeoutMs: number;
}

export class ProxyCheckError extends Error {
  constructor(
    message: string,
    public readonly code: "connect" | "handshake" | "auth" | "rejected" | "timeout",
  ) {
    super(message);
    this.name = "ProxyCheckError";
  }
}

export function tcpConnect(host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new ProxyCheckError(`connect timeout to ${host}:${port}`, "timeout"));
      }
    }, timeoutMs);
    socket.once("connect", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(socket);
      }
    });
    socket.once("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new ProxyCheckError(`connect failed: ${(err as Error).message}`, "connect"));
      }
    });
  });
}

/** Preserve surplus bytes when a proxy sends multiple handshake packets at once. */
const socketReadBuffers = new WeakMap<Socket, Buffer>();

export function readExact(socket: Socket, n: number, deadlineMs: number): Promise<Buffer> {
  const buffered = socketReadBuffers.get(socket) ?? Buffer.alloc(0);
  if (buffered.length >= n) {
    socketReadBuffers.set(socket, buffered.subarray(n));
    return Promise.resolve(buffered.subarray(0, n));
  }

  return new Promise((resolve, reject) => {
    let buffer = buffered;
    const timer = setTimeout(() => {
      cleanup();
      reject(new ProxyCheckError("read timeout", "timeout"));
    }, deadlineMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onErr);
      socket.removeListener("close", onClose);
    };
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length >= n) {
        const result = buffer.subarray(0, n);
        socketReadBuffers.set(socket, buffer.subarray(n));
        cleanup();
        resolve(result);
      }
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(new ProxyCheckError(`read failed: ${err.message}`, "connect"));
    };
    const onClose = () => {
      cleanup();
      reject(new ProxyCheckError("socket closed early", "connect"));
    };
    socket.on("data", onData);
    socket.on("error", onErr);
    socket.once("close", onClose);
  });
}

function isV4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isV6(host: string): boolean {
  return host.includes(":");
}

function destinationPort(target: TargetUrl): number {
  if (target.port !== undefined) return target.port;
  const url = new URL(target.url);
  return url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
}

export function tlsOver(socket: Socket, host: string, deadlineMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProxyCheckError("tls timeout", "timeout")), deadlineMs);
    const secured = tls.connect(
      { socket, servername: host, rejectUnauthorized: true },
      () => {
        clearTimeout(timer);
        resolve(secured as unknown as Socket);
      },
    );
    secured.once("error", (err) => {
      clearTimeout(timer);
      reject(new ProxyCheckError(`tls failed: ${err.message}`, "handshake"));
    });
  });
}

export async function socks5Tunnel(
  proxy: { host: string; port: number } & ProxyAuth,
  target: TargetUrl,
  limits: CheckLimits,
): Promise<Socket> {
  const started = Date.now();
  const deadline = () => Math.max(1, limits.totalTimeoutMs - (Date.now() - started));
  const socket = await tcpConnect(proxy.host, proxy.port, limits.connectTimeoutMs);
  try {
    const withAuth = Boolean(proxy.user);
    socket.write(withAuth ? Buffer.from([0x05, 0x02, 0x00, 0x02]) : Buffer.from([0x05, 0x01, 0x00]));
    const greeting = await readExact(socket, 2, deadline());
    if ((greeting[0] ?? -1) !== 0x05) throw new ProxyCheckError("socks5: bad version", "handshake");
    if ((greeting[1] ?? -1) === 0xff) throw new ProxyCheckError("socks5: no acceptable method", "handshake");

    if (greeting[1] === 0x02) {
      const user = Buffer.from(proxy.user ?? "", "utf8");
      const pass = Buffer.from(proxy.pass ?? "", "utf8");
      if (user.length > 255 || pass.length > 255) throw new ProxyCheckError("socks5: creds too long", "auth");
      socket.write(Buffer.concat([Buffer.from([0x01, user.length]), user, Buffer.from([pass.length]), pass]));
      const authReply = await readExact(socket, 2, deadline());
      if ((authReply[1] ?? -1) !== 0x00) throw new ProxyCheckError("socks5: auth rejected", "auth");
    }

    const targetPort = destinationPort(target);
    const portBuf = Buffer.from([targetPort >> 8, targetPort & 0xff]);
    let addrBuf: Buffer;
    let atype: number;
    if (isV4(target.hostname)) {
      atype = 0x01;
      addrBuf = Buffer.from(target.hostname.split(".").map(Number));
    } else if (isV6(target.hostname)) {
      atype = 0x04;
      addrBuf = v6ToBuffer(target.hostname);
    } else {
      atype = 0x03;
      const domain = Buffer.from(target.hostname, "utf8");
      if (domain.length > 255) throw new ProxyCheckError("socks5: domain too long", "handshake");
      addrBuf = Buffer.concat([Buffer.from([domain.length]), domain]);
    }
    socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, atype]), addrBuf, portBuf]));

    const head = await readExact(socket, 4, deadline());
    const replyCode = head[1] ?? -1;
    if (replyCode !== 0x00) {
      const reasons: Record<number, string> = {
        1: "general failure", 2: "not allowed", 3: "network unreachable",
        4: "host unreachable", 5: "connection refused", 6: "ttl expired",
        7: "command not supported", 8: "address type not supported",
      };
      throw new ProxyCheckError(`socks5: refused (${reasons[replyCode] ?? replyCode})`, "rejected");
    }
    const bindAt = head[3] ?? 0;
    const bindLen = bindAt === 0x01 ? 4 : bindAt === 0x04 ? 16 : 1;
    let bindSkip = bindLen;
    if (bindAt === 0x03) {
      const domainLength = await readExact(socket, 1, deadline());
      bindSkip += domainLength[0] ?? 0;
    }
    await readExact(socket, bindSkip + 2, deadline());
    return socket;
  } catch (err) {
    socket.destroy();
    throw err;
  }
}

function v6ToBuffer(host: string): Buffer {
  const pieces = host.split("::");
  if (pieces.length > 2) throw new ProxyCheckError("socks5: bad ipv6", "handshake");
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < (pieces.length === 2 ? 1 : 0)) throw new ProxyCheckError("socks5: bad ipv6", "handshake");
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8) throw new ProxyCheckError("socks5: bad ipv6", "handshake");
  const output = Buffer.alloc(16);
  groups.forEach((group, index) => output.writeUInt16BE(Number.parseInt(group || "0", 16), index * 2));
  return output;
}

export async function socks4Tunnel(
  proxy: { host: string; port: number } & ProxyAuth,
  target: TargetUrl,
  limits: CheckLimits,
): Promise<Socket> {
  const started = Date.now();
  const deadline = () => Math.max(1, limits.totalTimeoutMs - (Date.now() - started));
  const socket = await tcpConnect(proxy.host, proxy.port, limits.connectTimeoutMs);
  try {
    const targetPort = destinationPort(target);
    const portBuf = Buffer.from([targetPort >> 8, targetPort & 0xff]);
    const userId = Buffer.from(`${(proxy.user ?? "yc").replace(/\0/g, "").slice(0, 255)}\0`, "utf8");
    let request: Buffer;
    if (isV4(target.hostname)) {
      request = Buffer.concat([Buffer.from([0x04, 0x01]), portBuf, Buffer.from(target.hostname.split(".").map(Number)), userId]);
    } else if (isV6(target.hostname)) {
      throw new ProxyCheckError("socks4: ipv6 not supported by protocol", "handshake");
    } else {
      const domain = Buffer.from(target.hostname, "utf8");
      if (domain.length === 0 || domain.length > 255) throw new ProxyCheckError("socks4: bad domain", "handshake");
      request = Buffer.concat([Buffer.from([0x04, 0x01]), portBuf, Buffer.from([0, 0, 0, 1]), userId, domain, Buffer.from([0])]);
    }
    socket.write(request);
    const reply = await readExact(socket, 8, deadline());
    const replyCode = reply[1] ?? -1;
    if (replyCode !== 0x5a) {
      const reasons: Record<number, string> = {
        0x5b: "failed", 0x5c: "refused (no identd)", 0x5d: "refused (ident mismatch)",
      };
      throw new ProxyCheckError(`socks4: ${reasons[replyCode] ?? "refused"}`, "rejected");
    }
    return socket;
  } catch (err) {
    socket.destroy();
    throw err;
  }
}
