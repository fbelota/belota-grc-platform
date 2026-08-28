import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Grid3x3, AlertTriangle } from "lucide-react";

const L = [1, 2, 3, 4, 5];
const LB = { 1: "Muito Baixo", 2: "Baixo", 3: "Médio", 4: "Alto", 5: "Muito Alto" };
const color = s => s >= 15 ? "bg-red-600 text-white" : s >= 10 ? "bg-orange-500 text-white" : s >= 6 ? "bg-amber-500 text-black" : s >= 3 ? "bg-yellow-400 text-black" : "bg-emerald-600 text-white";

export default function RiskMatrix({ companyId }) {
  const [risks, setRisks] = useState([]);
  useEffect(() => { api.get(`/companies/${companyId}/risks`).then(r => setRisks(r.data)); }, [companyId]);

  const mx = {};
  risks.forEach(r => { (mx[`${r.probability}-${r.impact}`] = mx[`${r.probability}-${r.impact}`] || []).push(r); });
  const crit = risks.filter(r => r.probability * r.impact >= 15).length;
  const high = risks.filter(r => r.probability * r.impact >= 10 && r.probability * r.impact < 15).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Grid3x3 className="text-belota-gold w-5 h-5"/> Matriz de Riscos GRC</h2>
          <p className="text-sm text-belota-muted">Heatmap 5×5 — probabilidade × impacto</p>
        </div>
        <div className="flex gap-5 text-center">
          <div><div className="text-2xl font-bold text-red-500">{crit}</div><div className="text-xs text-belota-muted">Críticos</div></div>
          <div><div className="text-2xl font-bold text-orange-500">{high}</div><div className="text-xs text-belota-muted">Altos</div></div>
          <div><div className="text-2xl font-bold text-belota-gold">{risks.length}</div><div className="text-xs text-belota-muted">Total</div></div>
        </div>
      </div>

      <div className="bg-belota-surface border border-belota-border rounded-lg p-5 overflow-x-auto">
        <div className="min-w-[640px] grid gap-1" style={{ gridTemplateColumns: "90px repeat(5, 1fr)" }}>
          <div/>
          {L.map(p => <div key={p} className="text-center text-xs font-bold text-belota-gold py-1">{LB[p]}</div>)}
          {[...L].reverse().map(i => [
            <div key={`r${i}`} className="flex items-center justify-end pr-2 text-xs font-bold text-belota-gold">{LB[i]}</div>,
            ...L.map(p => {
              const s = p * i, n = (mx[`${p}-${i}`] || []).length;
              return (
                <div key={`${p}-${i}`} className={`${color(s)} rounded min-h-[64px] flex flex-col items-center justify-center`}>
                  <div className="text-xl font-bold">{s}</div>
                  {n > 0 && <div className="text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>{n}</div>}
                </div>
              );
            })
          ])}
          <div/>
          <div className="col-span-5 text-center text-xs text-belota-muted font-bold pt-2">PROBABILIDADE →</div>
        </div>
      </div>
    </div>
  );
}
