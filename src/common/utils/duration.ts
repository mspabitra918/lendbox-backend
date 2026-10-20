const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Parses "15m", "1h", "7d" into milliseconds. */
export function parseDurationMs(value: string): number {
  const m = /^(\d+)([smhd])$/.exec(value);
  if (!m) throw new Error(`Invalid duration: ${value}`);
  return Number(m[1]) * UNIT_MS[m[2]];
}
