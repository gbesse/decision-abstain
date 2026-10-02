# Decision Abstain

Calibrate, test and enforce abstention for finite AI decisions. High accuracy when the correct answer is present does not prove that a model will refuse when every offered answer is wrong.

## What it does

- applies confidence and top-two margin thresholds;
- measures coverage, selective accuracy and absent-answer recall;
- calibrates thresholds with a higher cost for confidently answering an impossible question;
- prevents holdout data from entering calibration;
- converts one multi-choice question into independent Boolean candidate checks;
- generates adversarial cases by removing the known correct answer.

## Install and use

```sh
npm install @gbesse/decision-abstain
decision-abstain calibrate examples/calibration.json
```

```ts
import { calibrate, evaluateHoldout } from "@gbesse/decision-abstain";

const calibrated = calibrate(calibrationRows, {
  minimumCoverage: 0.6,
  minimumAbsentRecall: 0.9,
  absentErrorCost: 5,
});
const holdout = evaluateHoldout(holdoutRows, calibrated.policy);
```

The default utility assigns a cost of 5 to answering when the correct answer is absent, 1 to a normal wrong answer and 0.1 to abstention. Set those values from the real operational consequence rather than optimizing a generic score.

## Important limits

This package calibrates supplied probabilities; it does not make an uncalibrated model trustworthy. Use a time- or source-separated holdout, include naturally occurring missing-answer examples, and review high-impact decisions. Synthetic removal tests expose a failure mode but do not replace production evaluation.

## Development

```sh
npm install
npm run release:check
```

MIT licensed and provider-independent.
