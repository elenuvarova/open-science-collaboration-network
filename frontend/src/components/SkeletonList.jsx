function SkeletonRow({ wide }) {
  return (
    <div className="inst-row" style={{ cursor: "default", pointerEvents: "none" }}>
      <div className="skel" style={{ width: 16, height: 12, borderRadius: "var(--r-sm)" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="skel" style={{ height: 13, width: wide ? "60%" : "40%", borderRadius: "var(--r-sm)" }} />
        <div className="skel" style={{ height: 10, width: "30%", borderRadius: "var(--r-sm)" }} />
      </div>
      <div className="skel" style={{ width: 36, height: 22, borderRadius: "var(--r-full)" }} />
    </div>
  );
}

export default function SkeletonList({ rows = 8 }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} wide={i % 3 === 0} />
      ))}
    </div>
  );
}
