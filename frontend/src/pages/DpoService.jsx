import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Badge, Card } from "../components/ui-belota";
import { ShieldCheck, Sparkles, Loader2, CheckCircle2, Circle, Calendar, Download, FileText } from "lucide-react";

const btnGold = "inline-flex items-center gap-2 px-4 py-2 bg-belota-gold text-black text-sm font-semibold rounded hover:opacity-90 disabled:opacity-50";

export default function DpoService({ companyId, isStaff }) {
  const [tasks, setTasks] = useState([]);
  const [prog, setProg] = useState({ total: 0, completed: 0, progress_pct: 0 });
  const [reports, setReports] = useState([]);
  const [openRep, setOpenRep] = useState(null);
  const [busyPlan, setBusyPlan] = useState(false);
  const [busyRep, setBusyRep] = useState(false);

  const load = async () => {
    const [a, b, c] = await Promise.all([
      api.get(`/companies/${companyId}/dpo/plan`),
      api.get(`/companies/${companyId}/dpo/progress`),
      api.get(`/companies/${companyId}/dpo/reports`),
    ]);
    setTasks(a.data); setProg(b.data); setReports(c.data);
  };
  useEffect(() => { load(); }, [companyId]);

  const genPlan = async () => {
    if (!confirm("Gerar o plano anual DPO as a Service (12 meses)? Substitui o atual.")) return;
    setBusyPlan(true);
    try { await api.post(`/companies/${companyId}/dpo/plan/generate`); await load(); } finally { setBusyPlan(false); }
  };

  const genReport = async () => {
    setBusyRep(true);
    try {
      const { data } = await api.post(`/companies/${companyId}/dpo/report/generate`);
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const j = await api.get(`/companies/${companyId}/jobs/${data.job_id}`);
        if (j.data.status === "done" || j.data.status === "error") break;
      }
      await load();
    } finally { setBusyRep(false); }
  };

  const toggle = async (t) => {
    await api.put(`/companies/${companyId}/dpo/plan/${t.id}`, { status: t.status === "concluida" ? "pendente" : "concluida" });
    load();
  };

  const byMonth = tasks.reduce((a, t) => { (a[t.month] = a[t.month] || []).push(t); return a; }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="text-belota-gold w-5 h-5" /> DPO as a Service™</h2>
          <p className="text-sm text-belota-muted">Serviço continuado (R$ 2.500/mês): Encarregado formal + Suporte em Licitações + Monitoramento de Evidências TCE/ANPD — a empresa sempre “Audit Ready”.</p>
        </div>
        <div className="flex gap-2">
          {isStaff && <button className={btnGold} onClick={genPlan} disabled={busyPlan}>{busyPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />} Gerar Plano Anual</button>}
          {isStaff && <button className={btnGold} onClick={genReport} disabled={busyRep}>{busyRep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Relatório Mensal IA</button>}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge tone="gold">Encarregado (DPO) Formal</Badge>
        <Badge tone="gold">Suporte em Licitações</Badge>
        <Badge tone="gold">Monitoramento de Evidências TCE/ANPD</Badge>
      </div>

      {prog.total > 0 && (
        <Card>
          <div className="flex justify-between text-sm mb-2">
            <span>Ciclo anual DPOaaS</span>
            <span className="text-belota-gold font-bold">{prog.completed}/{prog.total} ({prog.progress_pct}%)</span>
          </div>
          <div className="h-3 bg-belota-border rounded-full overflow-hidden">
            <div className="h-3 bg-belota-gold transition-all" style={{ width: `${prog.progress_pct}%` }} />
          </div>
        </Card>
      )}

      {Object.keys(byMonth).sort((a, b) => a - b).map((m) => (
        <div key={m}>
          <h3 className="flex items-center gap-2 font-bold text-belota-gold mb-2"><Badge tone="gold">Mês {m}</Badge></h3>
          <div className="space-y-2">
            {byMonth[m].map((t) => (
              <Card key={t.id} className={`flex gap-3 ${t.status === "concluida" ? "opacity-70" : ""}`}>
                <button onClick={() => isStaff && toggle(t)}>
                  {t.status === "concluida" ? <CheckCircle2 className="text-emerald-500 w-6 h-6" /> : <Circle className="text-belota-border hover:text-belota-gold w-6 h-6" />}
                </button>
                <div>
                  <div className="flex items-center gap-2 text-xs text-belota-muted mb-1">
                    <Badge tone="neutral">{t.category}</Badge>
                    <span>{new Date(t.due_date).toLocaleDateString("pt-BR")}</span>
                  </div>
                  <div className={`font-semibold ${t.status === "concluida" ? "line-through text-belota-muted" : ""}`}>{t.title}</div>
                  <p className="text-sm text-belota-muted">{t.description}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
      {tasks.length === 0 && <Card className="text-center text-belota-muted py-10">Plano ainda não gerado. Clique em “Gerar Plano Anual”.</Card>}

      <div>
        <h3 className="font-bold text-belota-gold mb-2 flex items-center gap-2"><FileText className="w-4 h-4" /> Relatórios “Audit Ready”</h3>
        <div className="space-y-2">
          {reports.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between gap-3">
                <button className="text-left flex-1" onClick={() => setOpenRep(openRep === r.id ? null : r.id)}>
                  <div className="font-semibold">{r.title}</div>
                  <div className="text-xs text-belota-muted">{new Date(r.created_at).toLocaleString("pt-BR")}</div>
                </button>
                <button className={btnGold} onClick={() => window.open(`/api/companies/${companyId}/dpo/reports/${r.id}/pdf`)}><Download className="w-4 h-4" /> PDF</button>
              </div>
              {openRep === r.id && <pre className="mt-4 p-4 bg-belota-bg border border-belota-border rounded text-sm text-belota-text whitespace-pre-wrap max-h-96 overflow-y-auto">{r.content}</pre>}
            </Card>
          ))}
          {reports.length === 0 && <Card className="text-center text-belota-muted py-6">Nenhum relatório ainda. Use “Relatório Mensal IA”.</Card>}
        </div>
      </div>
    </div>
  );
}