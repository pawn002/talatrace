/** Reference measurements, not estimates for the device currently running the app.
 * LibriSpeech test-clean: 12 speakers / 265 normalized words / 99.93 s.
 * i7-1260P / Iris Xe, four threads, timing and pause metadata enabled.
 * Provenance and limitations: docs/speech-model-evaluation-2026-10-25.md.
 */
export const REFERENCE_BENCHMARKS: Readonly<Record<string, { processingMs: number; errors: number }>> = {
  tiny: { processingMs: 22623.8078, errors: 13 },
  base: { processingMs: 29602.2422, errors: 10 },
  small: { processingMs: 56322.2349, errors: 10 },
  large: { processingMs: 204741.95839999997, errors: 2 },
  medium: { processingMs: 122143.2279, errors: 3 },
  'large-v3-turbo-q5_0': { processingMs: 92148.223, errors: 3 },
  'parakeet-tdt-0.6b-v3': { processingMs: 28423.1972, errors: 5 },
};

export function referencePerformance(name: string): { speed: string; accuracy: string; speedRatio?: number; wordErrorRate?: number } {
  const measurement = REFERENCE_BENCHMARKS[name];
  return measurement ? {
    speed: `${(99.93 * 1000 / measurement.processingMs).toFixed(1)}× real time`,
    accuracy: `${(measurement.errors / 265 * 100).toFixed(1)}% errors`,
    speedRatio: 99.93 * 1000 / measurement.processingMs,
    wordErrorRate: measurement.errors / 265,
  } : { speed: 'Not measured', accuracy: 'Not measured' };
}
