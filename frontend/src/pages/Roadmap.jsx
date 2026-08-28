import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Badge } from "../components/ui-belota";
import { Map, Sparkles, CheckCircle2, Circle, Loader2, Calendar } from "lucide-react";

const PH = { 1: "Diagnóstico e Inventário", 2: "Análise e Avaliação", 3: "Documentação", 4: "Implementação", 5: "Certificação" };
const card = "bg-belota-surface border border-belota-border rounded-lg p-5";

export default function Roadmap({ companyId, isStaff }) {
  const [tasks, setTasks] = useState([]);
  const [prog, setProg] = useState({ total: 0, completed: 0, progress_pct: 0 });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [a, b] = await Promise.all([
      api.get(`/companies/${companyId}/roadmap`),
      api.get(`/companies/${companyId}/roadmap/progress`),
    ]);
    setTasks(a.data); setProg(b.data);
  };
  useEffect(() => { load(); }, [companyId]);

  const generate = async () => {
    if (!confirm("Gerar Roadmap de 15 dias? Substitui o atual.")) return;
    setBusy(true);
    try { await api.post(`/companies/${companyId}/roadmap/generate`); await load(); } finally { setBusy(false); }
  };

  const toggle = async (t) => {
    await api.put(`/companies/${companyId}/roadmap/${t.id}`, { status: t.status === "concluida" ? "pendente" : "concluida" });
    load();
  };

  const byPhase = tasks.reduce((a, t) => { (a[t.phase] = a[t.phase] || []).push(t); return a; }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Map className="text-belota-gold w-5 h-5"/> Roadmap de Governança</h2>
          <p className="text-sm text-belota-muted">Plano de execução — 15 dias corridos (Framework BELOTA GRC™)</p>
        </div>
        {isStaff && <button onClick={generate} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 bg-belota-gold text-black text-sm font-semibold rounded hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} Gerar Roadmap
        </button>}
      </div>

      {prog.total > 0 && (
        <div className={card}>
          <div className="flex justify-between text-sm mb-2">
            <span>Progresso Geral</span>
            <span className="text-belota-gold font-bold">{prog.completed}/{prog.total} ({prog.progress_pct}%)</span>
          </div>
          <div className="h-3 bg-belota-border rounded-full overflow-hidden">
            <div className="h-3 bg-belota-gold transition-all" style={{ width: `${prog.progress_pct}%` }}/>
          </div>
        </div>
      )}

      {Object.keys(byPhase).sort().map(p => (
        <div key={p}>
          <h3 className="flex items-center gap-2 font-bold text-belota-gold mb-2"><Badge tone="gold">Fase {p}</Badge> {PH[p]}</h3>
          <div className="space-y-2">
            {byPhase[p].map(t => (
              <div key={t.id} className={`${card} flex gap-3 ${t.status === "concluida" ? "opacity-70" : ""}`}>
                <button onClick={() => isStaff && toggle(t)}>
                  {t.status === "concluida" ? <CheckCircle2 className="text-emerald-500 w-6 h-6"/> : <Circle className="text-belota-border hover:text-belota-gold w-6 h-6"/>}
                </button>
                <div>
                  <div className="flex items-center gap-2 text-xs text-belota-muted mb-1">
                    <Badge tone="neutral">Dia {t.day}</Badge>
                    <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3"/>{new Date(t.due_date).toLocaleDateString("pt-BR")}</span>
                  </div>
                  <div className={`font-semibold ${t.status === "concluida" ? "line-through text-belota-muted" : ""}`}>{t.title}</div>
                  <p className="text-sm text-belota-muted">{t.description}</p>
                  <div className="text-xs text-belota-gold mt-1">Entregável: {t.deliverable}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {tasks.length === 0 && <div className={`${card} text-center text-belota-muted py-10`}>Roadmap ainda não gerado. Clique em “Gerar Roadmap”.</div>}
    </div>
  );
}
