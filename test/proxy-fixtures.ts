import http from "node:http";
import net from "node:net";

export interface FixtureServer {
  url: string;
  close(): Promise<void>;
  hits: number;
}

export async function startHttpProxy(status = 403): Promise<FixtureServer> {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits += 1;
    const body = Buffer.from(`fixture-${status}`);
    res.writeHead(status, { "content-type": "text/plain", "content-length": body.length, connection: "close" });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP fixture did not bind");
  return {
    url: `http://127.0.0.1:${address.port}`,
    get hits() { return hits; },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export async function startSocks5Proxy(status = 404): Promise<FixtureServer> {
  let hits = 0;
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let phase: "greeting" | "connect" | "http" = "greeting";

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (phase === "greeting" && buffer.length >= 2) {
        const methods = buffer[1] ?? 0;
        if (buffer.length < 2 + methods) return;
        buffer = buffer.subarray(2 + methods);
        socket.write(Buffer.from([0x05, 0x00]));
        phase = "connect";
      }
      if (phase === "connect" && buffer.length >= 4) {
        const type = buffer[3] ?? 0;
        const addressLength = type === 0x01 ? 4 : type === 0x04 ? 16 : (buffer[4] ?? 0) + 1;
        const packetLength = 4 + addressLength + 2;
        if (buffer.length < packetLength) return;
        buffer = buffer.subarray(packetLength);
        socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        phase = "http";
      }
      if (phase === "http" && buffer.length > 0) {
        hits += 1;
        const body = Buffer.from(`fixture-${status}`);
        socket.write(Buffer.from(`HTTP/1.1 ${status} Fixture\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`));
        socket.end(body);
        buffer = Buffer.alloc(0);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("SOCKS fixture did not bind");
  return {
    url: `socks5://127.0.0.1:${address.port}`,
    get hits() { return hits; },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
