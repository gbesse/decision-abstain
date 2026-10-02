export interface ScoredDecision {
  id: string;
  expected: string | null;
  probabilities: Record<string, number>;
  split?: "calibration" | "holdout";
}

export interface AbstentionPolicy {
  threshold: number;
  margin?: number;
  noneLabel?: string;
}

export interface AppliedDecision {
  id: string;
  outcome: string | null;
  abstained: boolean;
  reason?: "below-threshold" | "below-margin" | "explicit-none";
  score: number;
  margin: number;
}

export interface Metrics {
  total: number;
  answered: number;
  abstained: number;
  coverage: number;
  selectiveAccuracy: number | null;
  overallAccuracy: number;
  absentCount: number;
  absentRecall: number | null;
  falseAnswerRateOnAbsent: number | null;
}

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function round(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }

export function validateExample(example: ScoredDecision): void {
  assert(typeof example.id === "string" && example.id.length > 0, "id is required");
  const entries = Object.entries(example.probabilities);
  assert(entries.length >= 2, `${example.id}: at least two candidates are required`);
  assert(entries.every(([label, score]) => label.length > 0 && Number.isFinite(score) && score >= 0 && score <= 1), `${example.id}: probabilities must be between zero and one`);
  const sum = entries.reduce((total, [, score]) => total + score, 0);
  assert(Math.abs(sum - 1) <= 0.001, `${example.id}: probabilities must sum to one`);
  if (example.expected !== null) assert(Object.hasOwn(example.probabilities, example.expected), `${example.id}: expected label is missing from probabilities`);
}

export function applyAbstention(example: ScoredDecision, policy: AbstentionPolicy): AppliedDecision {
  validateExample(example);
  assert(policy.threshold >= 0 && policy.threshold <= 1, "threshold must be between zero and one");
  assert((policy.margin ?? 0) >= 0 && (policy.margin ?? 0) <= 1, "margin must be between zero and one");
  const ranked = Object.entries(example.probabilities).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [bestLabel, bestScore] = ranked[0]!;
  const decisionMargin = bestScore - ranked[1]![1];
  if (policy.noneLabel && bestLabel === policy.noneLabel) return { id: example.id, outcome: null, abstained: true, reason: "explicit-none", score: bestScore, margin: decisionMargin };
  if (bestScore < policy.threshold) return { id: example.id, outcome: null, abstained: true, reason: "below-threshold", score: bestScore, margin: decisionMargin };
  if (decisionMargin < (policy.margin ?? 0)) return { id: example.id, outcome: null, abstained: true, reason: "below-margin", score: bestScore, margin: decisionMargin };
  return { id: example.id, outcome: bestLabel, abstained: false, score: bestScore, margin: decisionMargin };
}

export function evaluate(examples: ScoredDecision[], policy: AbstentionPolicy): Metrics {
  assert(examples.length > 0, "At least one example is required");
  const applied = examples.map(example => ({ example, result: applyAbstention(example, policy) }));
  const answered = applied.filter(x => !x.result.abstained);
  const absent = applied.filter(x => x.example.expected === null);
  const correctAnswered = answered.filter(x => x.result.outcome === x.example.expected).length;
  const correctOverall = applied.filter(x => x.result.outcome === x.example.expected).length;
  const correctlyRejected = absent.filter(x => x.result.abstained).length;
  return {
    total: examples.length, answered: answered.length, abstained: examples.length - answered.length,
    coverage: round(answered.length / examples.length),
    selectiveAccuracy: answered.length ? round(correctAnswered / answered.length) : null,
    overallAccuracy: round(correctOverall / examples.length),
    absentCount: absent.length,
    absentRecall: absent.length ? round(correctlyRejected / absent.length) : null,
    falseAnswerRateOnAbsent: absent.length ? round((absent.length - correctlyRejected) / absent.length) : null,
  };
}

export interface CalibrationOptions {
  thresholds?: number[];
  margins?: number[];
  minimumCoverage?: number;
  minimumAbsentRecall?: number;
  absentErrorCost?: number;
  wrongAnswerCost?: number;
  abstentionCost?: number;
}

export interface CalibrationResult {
  policy: AbstentionPolicy;
  metrics: Metrics;
  utility: number;
  candidatesEvaluated: number;
}

export function calibrate(examples: ScoredDecision[], options: CalibrationOptions = {}): CalibrationResult {
  assert(examples.length > 0, "Calibration set cannot be empty");
  assert(examples.every(x => x.split !== "holdout"), "Holdout examples cannot be used for calibration");
  const thresholds = options.thresholds ?? Array.from({ length: 101 }, (_, i) => i / 100);
  const margins = options.margins ?? [0];
  const minimumCoverage = options.minimumCoverage ?? 0;
  const minimumAbsentRecall = options.minimumAbsentRecall ?? 0;
  const absentErrorCost = options.absentErrorCost ?? 5;
  const wrongAnswerCost = options.wrongAnswerCost ?? 1;
  const abstentionCost = options.abstentionCost ?? 0.1;
  let best: CalibrationResult | undefined;
  for (const threshold of thresholds) for (const margin of margins) {
    const policy = { threshold, margin };
    const metrics = evaluate(examples, policy);
    if (metrics.coverage < minimumCoverage || (metrics.absentRecall ?? 1) < minimumAbsentRecall) continue;
    const results = examples.map(example => ({ example, result: applyAbstention(example, policy) }));
    const utility = round(results.reduce((score, { example, result }) => {
      if (result.abstained) return score - abstentionCost;
      if (result.outcome === example.expected) return score + 1;
      return score - (example.expected === null ? absentErrorCost : wrongAnswerCost);
    }, 0) / examples.length);
    const candidate: CalibrationResult = { policy, metrics, utility, candidatesEvaluated: thresholds.length * margins.length };
    if (!best || candidate.utility > best.utility || (candidate.utility === best.utility && candidate.metrics.coverage > best.metrics.coverage) || (candidate.utility === best.utility && candidate.metrics.coverage === best.metrics.coverage && threshold < best.policy.threshold)) best = candidate;
  }
  assert(best, "No policy satisfies the requested constraints");
  return best;
}

export function evaluateHoldout(examples: ScoredDecision[], policy: AbstentionPolicy): Metrics {
  assert(examples.length > 0 && examples.every(x => x.split === "holdout"), "Only holdout examples may be evaluated here");
  return evaluate(examples, policy);
}

export function booleanDecomposition(options: { name: string; instructions: string; criteria: Record<string, string> }) {
  assert(Object.keys(options.criteria).length >= 2, "At least two candidates are required");
  return Object.fromEntries(Object.entries(options.criteria).map(([label, criterion]) => [`${options.name}__${label}`, {
    type: "boolean" as const,
    instructions: `${options.instructions}\nEvaluate only candidate “${label}”. Return true only when the evidence independently satisfies: ${criterion}`,
    candidate: label,
  }]));
}

export function combineBooleanAnswers(answers: Record<string, { probabilityTrue: number }>, prefix: string, policy: AbstentionPolicy): AppliedDecision {
  const entries = Object.entries(answers).filter(([name]) => name.startsWith(`${prefix}__`)).map(([name, answer]) => [name.slice(prefix.length + 2), answer.probabilityTrue] as const);
  assert(entries.length >= 2, "At least two Boolean candidate answers are required");
  assert(entries.every(([, probability]) => probability >= 0 && probability <= 1), "Boolean probabilities must be between zero and one");
  const ranked = entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [label, score] = ranked[0]!;
  const margin = score - ranked[1]![1];
  if (score < policy.threshold) return { id: prefix, outcome: null, abstained: true, reason: "below-threshold", score, margin };
  if (margin < (policy.margin ?? 0)) return { id: prefix, outcome: null, abstained: true, reason: "below-margin", score, margin };
  return { id: prefix, outcome: label, abstained: false, score, margin };
}

export function generateAbsentCases<T extends { id: string; expected: string; probabilities: Record<string, number> }>(examples: T[]): ScoredDecision[] {
  return examples.map(example => {
    validateExample(example);
    const labels = Object.keys(example.probabilities).filter(label => label !== example.expected);
    assert(labels.length >= 2, `${example.id}: need at least three original candidates to remove the correct answer`);
    const total = labels.reduce((sum, label) => sum + example.probabilities[label]!, 0);
    return { id: `${example.id}__absent`, expected: null, probabilities: Object.fromEntries(labels.map(label => [label, example.probabilities[label]! / total])) };
  });
}
