/**
 * Minimal HTTP health server so container/PaaS platforms can probe readiness.
 * The bot itself uses long polling and does not need a public webhook URL.
 */
import http from "node:http";

export interface HealthServer {
  port: number;
  close(): Promise<void>;
}

export function startHealthServer(port: number, host = "0.0.0.0"): Promise<HealthServer> {
  const startedAt = Date.now();

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    const pathOnly = url.split("?")[0] ?? "/";

    if (req.method === "GET" && (pathOnly === "/" || pathOnly === "/health" || pathOnly === "/healthz")) {
      const body = JSON.stringify({
        ok: true,
        service: "yori-proxy-checker",
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      });
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body),
        "cache-control": "no-store",
      });
      res.end(body);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const bound =
        address && typeof address === "object" ? address.port : port;
      console.log(`[health] listening on http://${host}:${bound}`);
      resolve({
        port: bound,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
