/**
 * Process an inbox from the command line and write the run + submission.
 *
 *   npm run process                         # the bundled sample inbox
 *   npm run process -- --source http://localhost:8080 --submit
 *   npm run process -- --no-ai              # rule engine only
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { aiConfig } from "@/lib/ai/claude";
import { toSubmission } from "@/lib/domain/submission";
import { processInbox } from "@/lib/pipeline/pipeline";
import { BundleSource, HttpSource, defaultBundleRoot, type InboxSource } from "@/lib/sources";
import { getStore } from "@/lib/store";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const location = option("--source");
const source: InboxSource =
  location && /^https?:\/\//.test(location)
    ? new HttpSource(location)
    : new BundleSource(location ? path.resolve(location) : defaultBundleRoot());
const ai = flag("--no-ai") ? { ...aiConfig(), enabled: false } : aiConfig();

console.log(`Tveris: processing ${source.descriptor.location} (AI ${ai.enabled ? ai.model : "off"})`);
const run = await processInbox(source, {
  ai,
  onProgress: ({ done, total }) => {
    if (done % 25 === 0 || done === total) process.stdout.write(`  ${done}/${total}\n`);
  },
});

const submission = toSubmission(run.results);
const outDir = path.resolve(option("--out") ?? ".tveris");
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "submission.json"), JSON.stringify(submission, null, 2));
if (!flag("--no-save")) await getStore().saveRun(run);

const s = run.summary;
console.log(`Done in ${(run.durationMs / 1000).toFixed(1)}s`);
console.log(`  categories: ${JSON.stringify(s.byCategory)}`);
console.log(`  document checks: ${JSON.stringify(s.byStatus)}`);
console.log(`  failures: ${s.failures}, AI classified: ${s.aiClassified}, disagreements: ${s.disagreements}`);
console.log(`  submission: ${path.join(outDir, "submission.json")}`);

if (flag("--submit")) {
  if (!(source instanceof HttpSource)) throw new Error("--submit needs --source http://<host>:8080");
  console.log(JSON.stringify(await source.submit(submission), null, 2));
}
