function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function improvementRatio(baseline, candidate) {
  if (!Number.isFinite(baseline?.rmse) || baseline.rmse <= 0 || !Number.isFinite(candidate?.rmse)) return null;
  return (baseline.rmse - candidate.rmse) / baseline.rmse;
}

function indexesForDates(dates, selectedDates) {
  const allowed = new Set(selectedDates);
  return dates.map((date, index) => allowed.has(date) ? index : -1).filter((index) => index >= 0);
}

function metricsAt(perRun, indexes) {
  return indexes.map((index) => perRun[index]);
}

function rankCandidates(evaluated, indexes, aggregate, score) {
  return evaluated.map((candidate) => ({
    ...candidate,
    selectionMetric: aggregate(metricsAt(candidate.perRun, indexes)),
  })).sort((a, b) => score(a.selectionMetric) - score(b.selectionMetric));
}

function compactMetric(metric) {
  return {
    runs: metric?.runs ?? 0,
    count: metric?.count ?? 0,
    rmse: metric?.rmse ?? null,
    macroRmse: metric?.macroRmse ?? null,
    macroAbsBias: metric?.macroAbsBias ?? null,
  };
}

function bootstrapImprovement({
  candidatePerRun,
  baselinePerRun,
  dates,
  uniqueDates,
  aggregate,
  iterations,
  seed,
}) {
  const random = seededRandom(seed);
  const improvements = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sampledIndexes = [];
    for (let draw = 0; draw < uniqueDates.length; draw += 1) {
      const date = uniqueDates[Math.floor(random() * uniqueDates.length)];
      sampledIndexes.push(...indexesForDates(dates, [date]));
    }
    const baseline = aggregate(metricsAt(baselinePerRun, sampledIndexes));
    const candidate = aggregate(metricsAt(candidatePerRun, sampledIndexes));
    const improvement = improvementRatio(baseline, candidate);
    if (Number.isFinite(improvement)) improvements.push(improvement);
  }
  return {
    iterations: improvements.length,
    seed,
    lower95: percentile(improvements, 0.05),
    median: percentile(improvements, 0.5),
    upper95: percentile(improvements, 0.95),
  };
}

export function evaluateGeneralization({
  evaluated,
  baselinePerRun,
  dates,
  aggregate,
  score,
  minimumDates = 5,
  minimumRuns = 12,
  minimumOverallImprovement = 0.1,
  minimumNestedImprovement = 0.05,
  holdoutDateCount = null,
  bootstrapIterations = 2000,
  bootstrapSeed = 20261103,
}) {
  if (!evaluated.length) throw new Error("At least one candidate is required");
  if (baselinePerRun.length !== dates.length
    || evaluated.some((candidate) => candidate.perRun.length !== dates.length)) {
    throw new Error("Candidate, baseline, and date arrays must have equal lengths");
  }

  const uniqueDates = [...new Set(dates)].sort();
  const allIndexes = dates.map((_, index) => index);
  const ranked = rankCandidates(evaluated, allIndexes, aggregate, score);
  const finalCandidate = ranked[0];
  const baselineAggregate = aggregate(baselinePerRun);
  const finalAggregate = aggregate(finalCandidate.perRun);

  const finalByDate = uniqueDates.map((date) => {
    const indexes = indexesForDates(dates, [date]);
    const baseline = aggregate(metricsAt(baselinePerRun, indexes));
    const candidate = aggregate(metricsAt(finalCandidate.perRun, indexes));
    return {
      date,
      baseline: compactMetric(baseline),
      candidate: compactMetric(candidate),
      improvementRatio: improvementRatio(baseline, candidate),
      notWorse: candidate.rmse <= baseline.rmse,
    };
  });

  const nestedFolds = uniqueDates.map((heldOutDate) => {
    const trainingDates = uniqueDates.filter((date) => date !== heldOutDate);
    const trainingIndexes = indexesForDates(dates, trainingDates);
    const testIndexes = indexesForDates(dates, [heldOutDate]);
    const selected = rankCandidates(evaluated, trainingIndexes, aggregate, score)[0];
    const baseline = aggregate(metricsAt(baselinePerRun, testIndexes));
    const test = aggregate(metricsAt(selected.perRun, testIndexes));
    return {
      heldOutDate,
      config: selected.config ?? selected.candidate ?? null,
      training: compactMetric(selected.selectionMetric),
      baseline: compactMetric(baseline),
      test: compactMetric(test),
      improvementRatio: improvementRatio(baseline, test),
      notWorse: test.rmse <= baseline.rmse,
      selectedPerRun: metricsAt(selected.perRun, testIndexes),
      baselinePerRun: metricsAt(baselinePerRun, testIndexes),
    };
  });
  const nestedBaseline = aggregate(nestedFolds.flatMap((fold) => fold.baselinePerRun));
  const nestedTest = aggregate(nestedFolds.flatMap((fold) => fold.selectedPerRun));

  const requestedHoldoutCount = holdoutDateCount ?? Math.max(1, Math.ceil(uniqueDates.length * 0.2));
  const effectiveHoldoutCount = Math.min(requestedHoldoutCount, Math.max(1, uniqueDates.length - 2));
  const temporalDates = uniqueDates.slice(-effectiveHoldoutCount);
  const temporalTrainingDates = uniqueDates.slice(0, -effectiveHoldoutCount);
  const temporalTrainingIndexes = indexesForDates(dates, temporalTrainingDates);
  const temporalTestIndexes = indexesForDates(dates, temporalDates);
  const temporalSelected = rankCandidates(evaluated, temporalTrainingIndexes, aggregate, score)[0];
  const temporalBaseline = aggregate(metricsAt(baselinePerRun, temporalTestIndexes));
  const temporalTest = aggregate(metricsAt(temporalSelected.perRun, temporalTestIndexes));
  const temporalByDate = temporalDates.map((date) => {
    const indexes = indexesForDates(dates, [date]);
    const baseline = aggregate(metricsAt(baselinePerRun, indexes));
    const test = aggregate(metricsAt(temporalSelected.perRun, indexes));
    return {
      date,
      baseline: compactMetric(baseline),
      test: compactMetric(test),
      improvementRatio: improvementRatio(baseline, test),
      notWorse: test.rmse <= baseline.rmse,
    };
  });

  const bootstrap = bootstrapImprovement({
    candidatePerRun: finalCandidate.perRun,
    baselinePerRun,
    dates,
    uniqueDates,
    aggregate,
    iterations: bootstrapIterations,
    seed: bootstrapSeed,
  });
  const overallImprovement = improvementRatio(baselineAggregate, finalAggregate);
  const nestedImprovement = improvementRatio(nestedBaseline, nestedTest);
  const temporalImprovement = improvementRatio(temporalBaseline, temporalTest);
  const gates = {
    enoughDates: uniqueDates.length >= minimumDates,
    enoughRuns: dates.length >= minimumRuns,
    overallImprovement: overallImprovement >= minimumOverallImprovement,
    finalCandidateNoDateWorse: finalByDate.every((item) => item.notWorse),
    nestedImprovement: nestedImprovement >= minimumNestedImprovement,
    nestedNoDateWorse: nestedFolds.every((fold) => fold.notWorse),
    temporalHoldoutImproved: temporalImprovement > 0 && temporalByDate.every((item) => item.notWorse),
    bootstrapLowerBoundPositive: bootstrap.lower95 > 0,
  };

  return {
    accepted: Object.values(gates).every(Boolean),
    gates,
    thresholds: {
      minimumDates,
      minimumRuns,
      minimumOverallImprovement,
      minimumNestedImprovement,
      holdoutDateCount: effectiveHoldoutCount,
    },
    finalCandidate: {
      config: finalCandidate.config ?? finalCandidate.candidate ?? null,
      aggregate: compactMetric(finalAggregate),
      improvementRatio: overallImprovement,
      byDate: finalByDate,
    },
    nested: {
      aggregate: compactMetric(nestedTest),
      baseline: compactMetric(nestedBaseline),
      improvementRatio: nestedImprovement,
      folds: nestedFolds.map(({ selectedPerRun, baselinePerRun: _baselinePerRun, ...fold }) => fold),
    },
    temporalHoldout: {
      trainingDates: temporalTrainingDates,
      holdoutDates: temporalDates,
      config: temporalSelected.config ?? temporalSelected.candidate ?? null,
      baseline: compactMetric(temporalBaseline),
      test: compactMetric(temporalTest),
      improvementRatio: temporalImprovement,
      byDate: temporalByDate,
    },
    bootstrap,
  };
}
