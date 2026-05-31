import { useState } from "react";

const STEPS = [
  {
    title: "Find the right research partners before writing the grant",
    body: "Open Science Collaboration Network maps who researches what, who collaborates with whom, and where your consortium has gaps — using open data from OpenAlex and CORDIS.",
    img: "🔬",
  },
  {
    title: "Partner Shortlist",
    body: "Institutions ranked by Partner Fit Score — a weighted blend of topic relevance, publication activity, EU project history, and network centrality. Click any row to see the full breakdown.",
    img: "📋",
  },
  {
    title: "Network Map",
    body: "A collaboration graph built from co-authorship links and shared EU projects. Node size = how central the institution is. Color = research cluster (detected automatically). Click a node to open its profile.",
    img: "🕸️",
  },
  {
    title: "Consortium Gaps",
    body: "See which roles your consortium covers strongly — and which are missing. Strong research side but no public-body partner? The gap view flags it before you write the proposal.",
    img: "🧩",
  },
  {
    title: "6 research topics, live data",
    body: "The dataset covers 6 topics — Climate adaptation, AI in education, Soil health, Circular economy, Digital health, Biodiversity conservation — sourced weekly from OpenAlex and CORDIS. Switch topics using the selector in the header.",
    img: "🌍",
  },
];

export default function Tour({ onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function finish() {
    localStorage.setItem("tour_done", "1");
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: "1rem",
    }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 14, width: "100%", maxWidth: 480,
        padding: "2rem", position: "relative",
      }}>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "var(--sp-6)", justifyContent: "center" }}>
          {STEPS.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              width: i === step ? 20 : 8, height: 8, borderRadius: 4,
              background: i === step ? "var(--accent)" : "var(--border)",
              transition: "width 0.2s, background 0.2s", cursor: "pointer",
            }} />
          ))}
        </div>

        <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--sp-4)", textAlign: "center" }}>{current.img}</div>
        <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--w-bold)", marginBottom: "var(--sp-3)", lineHeight: "var(--leading-snug)", textAlign: "center" }}>
          {current.title}
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-3)", lineHeight: "var(--leading-relaxed)", marginBottom: "var(--sp-8)", textAlign: "center" }}>
          {current.body}
        </p>

        <div style={{ display: "flex", gap: "var(--sp-3)", justifyContent: "center" }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={{
              background: "none", border: "1px solid var(--border)", color: "var(--text-2)",
              borderRadius: "var(--r-md)", padding: "var(--sp-2) var(--sp-4)", cursor: "pointer",
              fontSize: "var(--text-sm)", fontWeight: "var(--w-medium)",
            }}>Back</button>
          )}
          {!isLast && (
            <button onClick={() => setStep(s => s + 1)} style={{
              background: "var(--accent)", border: "none", color: "#fff",
              borderRadius: "var(--r-md)", padding: "var(--sp-2) var(--sp-5)", cursor: "pointer",
              fontSize: "var(--text-sm)", fontWeight: "var(--w-semibold)",
            }}>Next</button>
          )}
          {isLast && (
            <button onClick={finish} style={{
              background: "var(--accent)", border: "none", color: "#fff",
              borderRadius: "var(--r-md)", padding: "var(--sp-2) var(--sp-5)", cursor: "pointer",
              fontSize: "var(--text-sm)", fontWeight: "var(--w-semibold)",
            }}>Get started</button>
          )}
        </div>

        <button onClick={finish} style={{
          position: "absolute", top: "var(--sp-4)", right: "var(--sp-4)",
          background: "none", border: "none", color: "var(--text-3)",
          cursor: "pointer", fontSize: "var(--text-base)", lineHeight: 1,
        }}>✕</button>
      </div>
    </div>
  );
}
