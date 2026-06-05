// Raw institution type → badge class + label. Colours live in CSS tokens scoped
// by [data-theme], so the badge flips light/dark automatically (no theme prop).
const TYPE_MAP = {
  university:  { className: "type-education", label: "Education" },
  education:   { className: "type-education", label: "Education" },
  company:     { className: "type-company",   label: "Company" },
  ngo:         { className: "type-ngo",       label: "NGO" },
  nonprofit:   { className: "type-ngo",       label: "NGO" },
  public_body: { className: "type-public",    label: "Public body" },
  government:  { className: "type-public",    label: "Public body" },
  healthcare:  { className: "type-health",    label: "Healthcare" },
  facility:    { className: "type-facility",  label: "Facility" },
  archive:     { className: "type-facility",  label: "Facility" },
  funder:      { className: "type-funder",    label: "Funder" },
  other:       { className: "type-other",     label: "Unknown" },
  unknown:     { className: "type-other",     label: "Unknown" },
  missing:     { className: "type-other",     label: "Unknown" },
};

export default function TypeBadge({ type }) {
  const key = type?.toLowerCase().replace(/ /g, "_") || "unknown";
  const { className, label } = TYPE_MAP[key] || TYPE_MAP.unknown;
  return <span className={"type-badge " + className}>{label}</span>;
}
