import { describe, expect, it } from "vitest";
import { parseProxies, looksLikeProxyList } from "../src/checker/parse.js";
import { isPrivateIp, sanitizeFileName, validateTargetUrl } from "../src/checker/targets.js";
import { buildResultFiles } from "../src/checker/report.js";
import { stylize } from "../src/util/stylize.js";

describe("proxy parser", () => {
  it("accepts common proxy formats and preserves raw lines", () => {
    const result = parseProxies([
      "1.2.3.4:8080",
      "http://user:pass@5.6.7.8:3128",
      "9.8.7.6:1080/5",
      "socks4://example.test:9050",
      "1.2.3.4:8080", // duplicate
      "not a proxy",
    ].join("\n"));

    expect(result.entries).toHaveLength(4);
    expect(result.counts).toEqual({ http: 1, socks4: 1, socks5: 1, auto: 1 });
    expect(result.rejected).toBe(1);
    expect(result.entries[1]).toMatchObject({ raw: "http://user:pass@5.6.7.8:3128", user: "user", pass: "pass", proto: "http" });
    expect(parseProxies("5.5.5.5:8000/5 user:pass").entries[0]).toMatchObject({ user: "user", pass: "pass" });
    expect(parseProxies("6.6.6.6 8080 user pass").entries[0]).toMatchObject({ host: "6.6.6.6", port: 8080, user: "user", pass: "pass" });
    expect(looksLikeProxyList("1.2.3.4:80\nexample.test:8080")).toBe(true);
    expect(looksLikeProxyList("hello\nworld")).toBe(false);
  });

  it("honors line limits and skips comments", () => {
    const result = parseProxies("# heading\n1.1.1.1:80\n2.2.2.2:80\n3.3.3.3:80", { maxLines: 2 });
    expect(result.totalLines).toBe(2);
    expect(result.entries).toHaveLength(2);
  });
});

describe("target safety and result files", () => {
  it("blocks private and metadata address ranges", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.10.10.10")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("192.0.2.10")).toBe(false);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("2001:db8::1")).toBe(false);
    expect(isPrivateIp("public.example")).toBe(false);
  });

  it("rejects loopback target URLs before any request is made", async () => {
    const result = await validateTargetUrl("http://127.0.0.1:8080/health");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("private");
  });

  it("writes only hits and uses one file per target hostname", () => {
    const files = buildResultFiles(
      {
        perTarget: new Map([
          ["https://one.example/", ["1.2.3.4:80"]],
          ["https://two.example/", []],
        ]),
        allHits: ["1.2.3.4:80"],
        tested: 2,
        durationMs: 123,
      },
      [
        { display: "https://one.example/", url: "https://one.example/", hostname: "one.example", port: 443 },
        { display: "https://two.example/", url: "https://two.example/", hostname: "two.example", port: 443 },
      ],
    );
    expect(files.map((file) => file.name)).toEqual(["one.example.txt", "two.example.txt", "ALL_HITS.txt"]);
    expect(files[0]?.content).toBe("1.2.3.4:80\n");
    expect(files[1]?.content).toBe("");
    expect(files[2]?.content).toBe("1.2.3.4:80\n");
  });

  it("keeps the house font mapping deterministic", () => {
    expect(stylize("proxy check 123")).toBe("ᴘʀᴏxʏ ᴄʜᴇᴄᴋ ¹²³");
    expect(sanitizeFileName("example.com")).toBe("example.com.txt");
  });
});
