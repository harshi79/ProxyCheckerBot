import { afterEach, describe, expect, it } from "vitest";
import { parseProxies } from "../src/checker/parse.js";
import { runJob } from "../src/checker/engine.js";
import type { TargetUrl } from "../src/checker/types.js";
import { startHttpProxy, startSocks5Proxy, type FixtureServer } from "./proxy-fixtures.js";

const target: TargetUrl = {
  display: "http://fixture.example/health",
  url: "http://fixture.example/health",
  hostname: "fixture.example",
  port: 80,
};

const fixtures: FixtureServer[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
});

describe("checker integration against local proxy fixtures", () => {
  it("counts a 403 HTTP proxy response as a hit", async () => {
    const proxy = await startHttpProxy(403);
    fixtures.push(proxy);
    const parsed = parseProxies(`${proxy.url}\n127.0.0.1:1`);
    const progress: number[] = [];
    const result = await runJob(parsed.entries, [target], {
      onProgress: (stats) => progress.push(stats.done),
    });

    expect(result.allHits).toEqual([proxy.url]);
    expect(result.perTarget.get(target.url)).toEqual([proxy.url]);
    expect(progress.at(-1)).toBe(2);
    expect(proxy.hits).toBe(1);
  });

  it("speaks SOCKS5 and accepts a 404 response", async () => {
    const proxy = await startSocks5Proxy(404);
    fixtures.push(proxy);
    const parsed = parseProxies(proxy.url);
    const result = await runJob(parsed.entries, [target]);

    expect(result.allHits).toEqual([proxy.url]);
    expect(proxy.hits).toBe(1);
  });
});
