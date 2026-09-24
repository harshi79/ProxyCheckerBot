import http from "node:http";

export interface MockApiCall {
  method: string;
  body: string;
  contentType: string;
}

export class MockBotApiServer {
  private server: http.Server | undefined;
  private nextMessageId = 1;
  readonly calls: MockApiCall[] = [];
  readonly files = new Map<string, Buffer>();

  async start(): Promise<string> {
    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://mock.local");
      const body = await this.read(req);
      if (url.pathname.startsWith("/file/")) {
        const fileName = url.pathname.split("/").pop() ?? "file.txt";
        const data = this.files.get(fileName) ?? Buffer.from("1.2.3.4:8080\n");
        res.writeHead(200, { "content-type": "text/plain", "content-length": data.length });
        res.end(data);
        return;
      }

      const method = url.pathname.split("/").pop() ?? "unknown";
      this.calls.push({ method, body: body.toString("utf8"), contentType: String(req.headers["content-type"] ?? "") });
      let result: unknown;
      switch (method) {
        case "getMe":
          result = { id: 999, is_bot: true, first_name: "Yori", username: "YoriProxyCheckerBot" };
          break;
        case "sendMessage":
        case "sendPhoto":
        case "sendDocument":
        case "sendRichMessage":
        case "editMessageText":
          result = { message_id: this.nextMessageId++, date: Math.floor(Date.now() / 1000), chat: { id: 42, type: "private" } };
          break;
        case "sendRichMessageDraft":
        case "answerCallbackQuery":
        case "setMyCommands":
          result = true;
          break;
        case "getFile":
          result = { file_id: "fixture", file_unique_id: "fixture", file_size: 20, file_path: "fixture.txt" };
          break;
        default:
          result = true;
      }
      const payload = JSON.stringify({ ok: true, result });
      res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
      res.end(payload);
    });

    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("mock API did not bind");
    return `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => this.server?.close((error) => error ? reject(error) : resolve()));
    this.server = undefined;
  }

  private read(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }
}
