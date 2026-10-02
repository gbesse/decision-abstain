#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { calibrate, evaluate, type ScoredDecision } from "./index.js";

const [command, path, thresholdValue] = process.argv.slice(2);
if (!command || !path || !["calibrate", "evaluate"].includes(command)) {
  console.error("Usage: decision-abstain calibrate <examples.json> | evaluate <examples.json> <threshold>");
  process.exit(1);
}
try {
  const examples = JSON.parse(await readFile(path, "utf8")) as ScoredDecision[];
  const result = command === "calibrate" ? calibrate(examples) : evaluate(examples, { threshold: Number(thresholdValue) });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
