const SIZE = 64;
const STROKE = 5;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function ringColor(score) {
  if (score >= 70) return "var(--text-1)";
  if (score >= 50) return "var(--text-2)";
  return "var(--text-3)";
}

// `part` ({ value, max }) temporarily shows one component of the score (the
// profile's breakdown row under the pointer): the arc and the number move to it.
// The accessible name always states the overall score.
export default function ScoreRing({ score, size = SIZE, part = null }) {
  const scale = size / SIZE;
  const fraction = part ? Math.min(part.value / part.max, 1) : Math.min(score, 100) / 100;
  const offset = CIRC * (1 - fraction);
  const color = part ? "var(--accent)" : ringColor(score);

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
          className="ring-progress"
          stroke={color}
          strokeWidth={STROKE * scale}
          strokeDasharray={`${CIRC * scale} ${CIRC * scale}`}
          strokeDashoffset={offset * scale}
          strokeLinecap="round"
          // Fills from empty once on mount (.ring-progress), then follows changes.
          style={{ "--ring-from": `${CIRC * scale}px` }}
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
          color,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          transition: "color var(--dur-ui)",
        }}>
          {part ? part.value.toFixed(1) : Math.round(score)}
        </span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", lineHeight: 1.2 }}>/ {part ? part.max : 100}</span>
      </div>
    </div>
  );
}
