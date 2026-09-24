/**
 * In-memory job registry + FIFO queue with a running-slot cap.
 * Persistent settings live in SQLite; transient job state lives here.
 */
import type { ProxyEntry, TargetUrl } from "../checker/types.js";
import { config } from "../config.js";

export type JobStatus = "parsed" | "queued" | "running" | "done" | "cancelled" | "error";

export interface Job {
  id: string;
  userId: number;
  entries: ProxyEntry[];
  createdAt: number;
  status: JobStatus;
  targets: TargetUrl[];
  draftId?: number;
  abort?: AbortController;
  dbJobId?: number;
  report: {
    fileName?: string;
    fileSize?: number;
    lines: number;
    counts: { http: number; socks4: number; socks5: number; auto: number };
    rejected: number;
    targetDisplays: string[];
  };
}

let seq = 0;

export class JobStore {
  private readonly jobs = new Map<string, Job>();
  private readonly draftMap = new Map<number, string>();
  private readonly pendingQueue: string[] = [];
  private readonly running = new Set<string>();

  get runningCount(): number {
    return this.running.size;
  }

  create(userId: number, entries: ProxyEntry[], report: Job["report"]): Job {
    seq += 1;
    const job: Job = {
      id: `j${Date.now().toString(36)}${(seq % 1296).toString(36)}`,
      userId,
      entries,
      createdAt: Date.now(),
      status: "parsed",
      targets: [],
      report,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  replaceParsed(userId: number): void {
    for (const [id, job] of this.jobs) {
      if (job.userId === userId && job.status === "parsed") this.jobs.delete(id);
    }
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  blockingJob(userId: number): Job | undefined {
    for (const job of this.jobs.values()) {
      if (job.userId === userId && (job.status === "queued" || job.status === "running")) return job;
    }
    return undefined;
  }

  pendingJob(userId: number): Job | undefined {
    for (const job of this.jobs.values()) {
      if (job.userId === userId && job.status === "parsed") return job;
    }
    return undefined;
  }

  byDraft(draftId: number): Job | undefined {
    const id = this.draftMap.get(draftId);
    return id === undefined ? undefined : this.jobs.get(id);
  }

  setDraft(job: Job, draftId: number): void {
    if (job.draftId !== undefined) this.draftMap.delete(job.draftId);
    job.draftId = draftId;
    this.draftMap.set(draftId, job.id);
  }

  tryStart(job: Job): boolean {
    if (this.running.size >= config.maxRunningJobs) return false;
    job.status = "running";
    this.running.add(job.id);
    return true;
  }

  queue(job: Job): number {
    this.pendingQueue.push(job.id);
    job.status = "queued";
    return this.pendingQueue.length;
  }

  nextJob(): Job | undefined {
    while (this.pendingQueue.length > 0) {
      const id = this.pendingQueue.shift() as string;
      const job = this.jobs.get(id);
      if (!job) continue;
      if (this.tryStart(job)) return job;
      this.pendingQueue.unshift(id);
      job.status = "queued";
      return undefined;
    }
    return undefined;
  }

  finish(job: Job, status: "done" | "cancelled" | "error"): void {
    job.status = status;
    this.running.delete(job.id);
    if (job.draftId !== undefined) this.draftMap.delete(job.draftId);
    job.draftId = undefined;
  }

  sweep(maxAgeMs = 30 * 60_000): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.status !== "parsed" && job.status !== "queued" && now - job.createdAt > maxAgeMs) {
        this.jobs.delete(id);
        this.running.delete(id);
      }
    }
  }
}

export const jobStore = new JobStore();
