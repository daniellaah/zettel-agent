/** Cluster bootstrap of candidate minus baseline over paired scores; seeded and descriptive, not calibrated human quality. */
export function pairedBootstrap(
  pairs: readonly { group: string; baseline: number | null; candidate: number | null }[],
  samples = 2000,
) {
  if (!Number.isInteger(samples) || samples < 100 || samples > 100_000)
    throw new Error("Invalid bootstrap sample count");
  const groups = new Map<string, number[]>();
  for (const pair of pairs) {
    if (pair.baseline === null || pair.candidate === null) continue;
    if (
      !pair.group ||
      ![pair.baseline, pair.candidate].every(
        (score) => Number.isFinite(score) && score >= 0 && score <= 1,
      )
    )
      throw new Error("Invalid paired scores");
    const values = groups.get(pair.group) ?? [];
    values.push(pair.candidate - pair.baseline);
    groups.set(pair.group, values);
  }
  const clusters = [...groups.values()];
  const values = clusters.flat();
  if (!values.length) return { pairs: 0, clusters: 0, delta: null, ci95: null, samples };
  let seed = 0x12345678;
  const estimates: number[] = [];
  for (let trial = 0; trial < samples; trial++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < clusters.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const selected = clusters[Math.floor((seed / 4294967296) * clusters.length)]!;
      sum += selected.reduce((total, value) => total + value, 0);
      count += selected.length;
    }
    estimates.push(sum / count);
  }
  estimates.sort((a, b) => a - b);
  return {
    pairs: values.length,
    clusters: clusters.length,
    delta: values.reduce((sum, value) => sum + value, 0) / values.length,
    ci95: [
      estimates[Math.floor(samples * 0.025)]!,
      estimates[Math.min(samples - 1, Math.floor(samples * 0.975))]!,
    ],
    samples,
  };
}
