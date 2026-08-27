import React from "react";

export function Shield({ className = "w-9 h-9" }) {
  return (
    <svg viewBox="0 0 64 72" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 2 60 12v26c0 18-12 28-28 32C16 66 4 56 4 38V12L32 2Z"
        fill="#0B1426" stroke="#C5A059" strokeWidth="2.5" />
      <path d="M32 8 54 16v22c0 14-9 22-22 26C19 60 10 52 10 38V16L32 8Z"
        fill="#0F3D2B" fillOpacity="0.5" />
      <path d="M24 22h13c5 0 8 3 8 7 0 3-2 5-4 6 3 1 5 3 5 7 0 5-4 8-9 8H24V22Zm7 6v6h5c2 0 3-1 3-3s-1-3-3-3h-5Zm0 12v6h6c2 0 3-1 3-3s-1-3-3-3h-6Z"
        fill="#C5A059" />
      <path d="M20 48l4-6 3 3 5-8 4 5" stroke="#D4AF37" strokeWidth="2" fill="none" opacity="0.6"/>
    </svg>
  );
}

export function Logo({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <Shield className={compact ? "w-8 h-8" : "w-10 h-10"} />
      <div className="leading-none">
        <div className="font-heading font-bold tracking-tight text-belota-text text-lg">
          BELOTA <span className="text-belota-gold">GRC</span>
        </div>
        {!compact && <div className="overline mt-0.5">Governance OS</div>}
      </div>
    </div>
  );
}
