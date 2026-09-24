/**
 * Build the result documents for a finished job.
 */
import { JobResult } from "./engine.js";
import { TargetUrl } from "./types.js";
import { sanitizeFileName } from "./targets.js";

export interface ResultFile {
  name: string;
  content: string;
}

export function buildResultFiles(result: JobResult, targets: TargetUrl[]): ResultFile[] {
  const files: ResultFile[] = [];
  for (const t of targets) {
    const hits = result.perTarget.get(t.url) ?? [];
    files.push({
      name: sanitizeFileName(t.hostname),
      content: hits.join("\n") + (hits.length ? "\n" : ""),
    });
  }
  files.push({
    name: "ALL_HITS.txt",
    content: result.allHits.join("\n") + (result.allHits.length ? "\n" : ""),
  });
  return files;
}
