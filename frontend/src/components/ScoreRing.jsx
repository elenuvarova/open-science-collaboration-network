const SIZE = 64;
const STROKE = 5;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function ringColor(score) {
  if (score >= 70) return "var(--green)";
  if (score >= 50) return "var(--yellow)";
  return "var(--text-3)";
}

export default function ScoreRing({ score, size = SIZE }) {
  const scale = size / SIZE;
  const offset = CIRC * (1 - Math.min(score, 100) / 100);

  return (
    <div
      role="img"
      aria-label={`Partner fit score ${Math.round(score)} out of 100`}
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle
          cx={SIZE / 2 * scale} cy={SIZE / 2 * scale}
          r={R * scale} fill="none"
          stroke="var(--border)" strokeWidth={STROKE * scale}
        />
        {/* Progress */}
        <circle
          cx={SIZE / 2 * scale} cy={SIZE / 2 * scale}
          r={R * scale} fill="none"
          stroke={ringColor(score)}
          strokeWidth={STROKE * scale}
          strokeDasharray={`${CIRC * scale} ${CIRC * scale}`}
          strokeDashoffset={offset * scale}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset var(--dur-data) ease, stroke var(--dur-slow)" }}
        />
      </svg>
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 0,
      }}>
        <span style={{
          fontSize: size < 56 ? "var(--text-sm)" : "var(--text-base)",
          fontWeight: "var(--w-bold)",
          color: ringColor(score),
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}>
          {Math.round(score)}
        </span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", lineHeight: 1.2 }}>/ 100</span>
      </div>
    </div>
  );
}
