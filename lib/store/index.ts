import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EmailResult, Run, SourceDescriptor } from "@/lib/domain/types";
import { summarize } from "@/lib/domain/summary";

/**
 * Persistence for runs (one processed inbox) and their per-email updates
 * (reviews, retries). Two interchangeable backends:
 *   - PgStore when DATABASE_URL is set (the deployed, cloud configuration),
 *   - FileStore otherwise (local development; atomic JSON writes).
 * If neither holds a run yet, the committed snapshot in data/snapshot is
 * served, so a fresh deployment shows a processed inbox immediately.
 */
export interface Store {
  saveRun(run: Run): Promise<void>;
  latestRun(sourceKey: string): Promise<Run | null>;
  /** Replace one email's result inside a run (review, retry). */
  updateResult(sourceKey: string, result: EmailResult): Promise<Run | null>;
  /** Small derived documents (the AI weekly brief) keyed by name. */
  getMeta<T>(key: string): Promise<T | null>;
  setMeta(key: string, value: unknown): Promise<void>;
}

export function sourceKey(source: SourceDescriptor): string {
  return source.kind === "gmail" ? `gmail:${source.location.toLowerCase()}` : "sample";
}

function withResult(run: Run, result: EmailResult): Run {
  const results = run.results.map((existing) =>
    existing.email.email_id === result.email.email_id ? result : existing,
  );
  return { ...run, results, summary: summarize(results) };
}

const SNAPSHOT = path.join(process.cwd(), "data", "snapshot", "sample-run.json");

async function snapshotRun(key: string): Promise<Run | null> {
  if (key !== "sample") return null;
  try {
    return JSON.parse(await readFile(SNAPSHOT, "utf8")) as Run;
  } catch {
    return null;
  }
}

class FileStore implements Store {
  constructor(private readonly dir: string) {}

  private file(key: string): string {
    return path.join(this.dir, "runs", `${key.replace(/[^a-z0-9@._-]/gi, "_")}.json`);
  }

  async saveRun(run: Run): Promise<void> {
    const target = this.file(sourceKey(run.source));
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(run));
    await rename(temp, target);
  }

  async latestRun(key: string): Promise<Run | null> {
    try {
      return JSON.parse(await readFile(this.file(key), "utf8")) as Run;
    } catch {
      return snapshotRun(key);
    }
  }

  async updateResult(key: string, result: EmailResult): Promise<Run | null> {
    const run = await this.latestRun(key);
    if (run === null) return null;
    const updated = withResult(run, result);
    await this.saveRun(updated);
    return updated;
  }

  private metaFile(key: string): string {
    return path.join(this.dir, "meta", `${key.replace(/[^a-z0-9@._-]/gi, "_")}.json`);
  }

  async getMeta<T>(key: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.metaFile(key), "utf8")) as T;
    } catch {
      return null;
    }
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const target = this.metaFile(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(value));
    await rename(temp, target);
  }
}

class PgStore implements Store {
  private ready: Promise<import("pg").Pool> | null = null;

  constructor(private readonly url: string) {}

  private pool(): Promise<import("pg").Pool> {
    this.ready ??= (async () => {
      const { Pool } = await import("pg");
      const pool = new Pool({
        connectionString: this.url,
        max: 5,
        ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(this.url) ? undefined : { rejectUnauthorized: false },
      });
      await pool.query(`
        create table if not exists tveris_runs (
          source_key text primary key,
          run_id text not null,
          run jsonb not null,
          updated_at timestamptz not null default now()
        )`);
      await pool.query(`
        create table if not exists tveris_meta (
          key text primary key,
          value jsonb not null,
          updated_at timestamptz not null default now()
        )`);
      return pool;
    })();
    return this.ready;
  }

  async saveRun(run: Run): Promise<void> {
    const pool = await this.pool();
    await pool.query(
      `insert into tveris_runs (source_key, run_id, run, updated_at) values ($1, $2, $3, now())
       on conflict (source_key) do update set run_id = excluded.run_id, run = excluded.run, updated_at = now()`,
      [sourceKey(run.source), run.id, JSON.stringify(run)],
    );
  }

  async latestRun(key: string): Promise<Run | null> {
    const pool = await this.pool();
    const { rows } = await pool.query<{ run: Run }>(
      "select run from tveris_runs where source_key = $1",
      [key],
    );
    return rows[0]?.run ?? snapshotRun(key);
  }

  async updateResult(key: string, result: EmailResult): Promise<Run | null> {
    const run = await this.latestRun(key);
    if (run === null) return null;
    const updated = withResult(run, result);
    await this.saveRun(updated);
    return updated;
  }

  async getMeta<T>(key: string): Promise<T | null> {
    const pool = await this.pool();
    const { rows } = await pool.query<{ value: T }>("select value from tveris_meta where key = $1", [key]);
    return rows[0]?.value ?? null;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const pool = await this.pool();
    await pool.query(
      `insert into tveris_meta (key, value, updated_at) values ($1, $2, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
}

let store: Store | null = null;
export function getStore(): Store {
  store ??= process.env.DATABASE_URL
    ? new PgStore(process.env.DATABASE_URL)
    : new FileStore(path.resolve(/*turbopackIgnore: true*/ process.env.TVERIS_STATE_DIR ?? ".tveris"));
  return store;
}
