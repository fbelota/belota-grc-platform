import React from "react";

export function PageHeader({ overline, title, desc, actions }) {
  return (
    <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
      <div>
        {overline && <div className="overline mb-1">{overline}</div>}
        <h1 className="font-heading text-3xl font-bold tracking-tight">{title}</h1>
        {desc && <p className="text-belota-muted mt-1 text-sm max-w-2xl">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ children, className = "", overline, title }) {
  return (
    <div className={`bg-belota-surface border border-belota-border rounded-md p-6 ${className}`}>
      {(overline || title) && (
        <div className="mb-4">
          {overline && <div className="overline mb-1">{overline}</div>}
          {title && <h3 className="font-heading text-lg font-semibold">{title}</h3>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, accent }) {
  return (
    <div className="bg-belota-surface border border-belota-border rounded-md p-5 transition-transform hover:-translate-y-0.5">
      <div className="overline mb-2">{label}</div>
      <div className={`font-heading text-3xl font-bold ${accent ? "text-belota-gold" : "text-belota-text"}`}>{value}</div>
      {sub && <div className="text-xs text-belota-muted mt-1">{sub}</div>}
    </div>
  );
}

export function ScoreRing({ score, size = 128 }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  const color = score >= 80 ? "#185C42" : score >= 50 ? "#C5A059" : "#8B2323";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1A2744" strokeWidth="10" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="10" fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-3xl font-bold" style={{ color }}>{score}%</span>
        <span className="overline">Conformidade</span>
      </div>
    </div>
  );
}

const BADGE = {
  low: "bg-risk-low/20 text-emerald-300 border-risk-low/40",
  medium: "bg-belota-gold/15 text-belota-gold border-belota-gold/40",
  high: "bg-risk-high/20 text-red-300 border-risk-high/50",
  critical: "bg-risk-critical/30 text-red-200 border-risk-high/60",
  neutral: "bg-belota-elevated text-belota-muted border-belota-border",
  gold: "bg-belota-gold/15 text-belota-gold border-belota-gold/40",
  green: "bg-risk-low/20 text-emerald-300 border-risk-low/40",
};
export function Badge({ children, tone = "neutral" }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs border ${BADGE[tone] || BADGE.neutral}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="text-center py-14 border border-dashed border-belota-border rounded-md">
      <div className="text-belota-gold text-2xl mb-2">◆</div>
      <div className="font-heading text-belota-text">{title}</div>
      {hint && <div className="text-sm text-belota-muted mt-1">{hint}</div>}
    </div>
  );
}
