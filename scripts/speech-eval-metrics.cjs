// Transparent English scoring: NFKC, lowercase, punctuation removal, whitespace collapse.
// No number expansion or semantic/LLM corrections. Not directly comparable to other normalizers.
function words(text) {
  return text.normalize('NFKC').toLowerCase().replace(/[’']/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/u).filter(Boolean);
}
function score(reference, hypothesis) {
  const ref = words(reference), hyp = words(hypothesis);
  let row = hyp.map((_, i) => ({ distance: i + 1, substitutions: 0, deletions: 0, insertions: i + 1 }));
  row.unshift({ distance: 0, substitutions: 0, deletions: 0, insertions: 0 });
  for (let i = 1; i <= ref.length; i++) {
    const next = [{ distance: i, substitutions: 0, deletions: i, insertions: 0 }];
    for (let j = 1; j <= hyp.length; j++) {
      if (ref[i - 1] === hyp[j - 1]) next.push({ ...row[j - 1] });
      else {
        const candidates = [
          { ...row[j - 1], distance: row[j - 1].distance + 1, substitutions: row[j - 1].substitutions + 1 },
          { ...row[j], distance: row[j].distance + 1, deletions: row[j].deletions + 1 },
          { ...next[j - 1], distance: next[j - 1].distance + 1, insertions: next[j - 1].insertions + 1 },
        ];
        next.push(candidates.sort((a, b) => a.distance - b.distance)[0]);
      }
    }
    row = next;
  }
  const result = row[hyp.length];
  return { referenceWords: ref.length, hypothesisWords: hyp.length, ...result,
    wer: ref.length ? result.distance / ref.length : null };
}
function summarize(rows) {
  const totals = rows.reduce((sum, row) => {
    for (const key of ['referenceWords', 'distance', 'substitutions', 'deletions', 'insertions']) sum[key] += row.score[key];
    sum.audioSeconds += row.duration; sum.processingMs += row.processingMs;
    return sum;
  }, { referenceWords: 0, distance: 0, substitutions: 0, deletions: 0, insertions: 0, audioSeconds: 0, processingMs: 0 });
  return { count: rows.length, ...totals, wer: totals.referenceWords ? totals.distance / totals.referenceWords : null,
    audioPerProcessing: totals.processingMs ? totals.audioSeconds * 1000 / totals.processingMs : null };
}
module.exports = { words, score, summarize };
