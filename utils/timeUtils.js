function convertTimeToSeconds(raw) {
  if (!raw) return null;
  const cleaned = raw.trim();

  // Prefer mm:ss.ms segment if present (including content inside parentheses)
  const colonMatch = cleaned.match(/(\d{1,2}:\d{2}\.\d+)/);
  const candidate = colonMatch ? colonMatch[1] : cleaned.replace(/[()]/g, '').split(' ')[0];

  if (/^\d{1,2}:\d{2}/.test(candidate)) {
    const [mm, rest] = candidate.split(':');
    const seconds = parseFloat(rest);
    const minutes = parseInt(mm, 10);
    if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
    return minutes * 60 + seconds;
  }

  const numeric = parseFloat(candidate);
  return Number.isNaN(numeric) ? null : numeric;
}

function describeGap(p1Seconds, p2Seconds) {
  if (p1Seconds == null || p2Seconds == null) return null;
  const gap = Math.abs(p1Seconds - p2Seconds);
  const gapRounded = Math.round(gap * 1000) / 1000;

  if (gap > 1) {
    return { text: `is dominating the track with a gap of ${gapRounded.toFixed(3)} seconds.`, gap: gapRounded };
  }
  if (gap >= 0.3) {
    return { text: `has a strong lead with a gap of ${gapRounded.toFixed(3)} seconds.`, gap: gapRounded };
  }
  return { text: `is in a very close race with a gap of ${gapRounded.toFixed(3)} seconds.`, gap: gapRounded };
}

module.exports = {
  convertTimeToSeconds,
  describeGap,
};
