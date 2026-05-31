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
    title: "Seed topic: Climate adaptation",
    body: "The current dataset covers European climate adaptation research 2020–2025 (227k works, 2800+ institutions). Additional topics — AI in education, soil health, circular economy — can be ingested by re-running the ETL with a different topic config.",
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
        <div style={{ display: "flex", gap: "6px", marginBottom: "1.5rem" }}>
          {STEPS.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              width: i === step ? 20 : 8, height: 8, borderRadius: 4,
              background: i === step ? "var(--accent)" : "var(--border)",
              transition: "width 0.2s, background 0.2s", cursor: "pointer",
            }} />
          ))}
        </div>

        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>{current.img}</div>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.75rem", lineHeight: 1.4 }}>
          {current.title}
        </h2>
        <p style={{ fontSize: "0.875rem", color: "var(--muted)", lineHeight: 1.7, marginBottom: "2rem" }}>
          {current.body}
        </p>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={{
              background: "none", border: "1px solid var(--border)", color: "var(--muted)",
              borderRadius: 8, padding: "0.5rem 1.1rem", cursor: "pointer", fontSize: "0.875rem",
            }}>Back</button>
          )}
          {!isLast && (
            <button onClick={() => setStep(s => s + 1)} style={{
              background: "var(--accent)", border: "none", color: "#fff",
              borderRadius: 8, padding: "0.5rem 1.25rem", cursor: "pointer",
              fontSize: "0.875rem", fontWeight: 600,
            }}>Next</button>
          )}
          {isLast && (
            <button onClick={finish} style={{
              background: "var(--accent)", border: "none", color: "#fff",
              borderRadius: 8, padding: "0.5rem 1.25rem", cursor: "pointer",
              fontSize: "0.875rem", fontWeight: 600,
            }}>Get started</button>
          )}
        </div>

        <button onClick={finish} style={{
          position: "absolute", top: "1rem", right: "1rem",
          background: "none", border: "none", color: "var(--muted)",
          cursor: "pointer", fontSize: "1.1rem", lineHeight: 1,
        }}>✕</button>
      </div>
    </div>
  );
}
