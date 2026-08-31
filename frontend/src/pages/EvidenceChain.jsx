import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Badge, Card } from "../components/ui-belota";
import { ShieldCheck, Lock, Loader2, Fingerprint } from "lucide-react";

const field = "w-full bg-belota-elevated border border-belota-border rounded p-2 text-sm text-belota-text placeholder:text-belota-muted focus:outline-none focus:border-belota-gold";
const btnGold = "inline-flex items-center gap-2 px-4 py-2 bg-belota-gold text-black text-sm font-semibold rounded hover:opacity-90 disabled:opacity-50";

export default function EvidenceChain({ companyId, canCreate }) {
  const [items, setItems] = useState([]);
  const [report, setReport] = useState(null);
  const [sealed, setSealed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", module: "", reference: "", description: "" });

  const load = () => api.get(`/companies/${companyId}/evidence-chain`).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [companyId]);

  const create = async () => {
    if (!form.title.trim()) { alert("Informe o título da evidência"); return; }
    await api.post(`/companies/${companyId}/evidence-chain`, form);
    setForm({ title: "", module: "", reference: "", description: "" });
    load();
  };

  const verify = async () => {
    setBusy(true);
    try { const { data } = await api.get(`/companies/${companyId}/evidence-chain/verify`); setReport(data); }
    finally { setBusy(false); }
  };

  const seal = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/companies/${companyId}/evidence-chain/seal`); setSealed(data.sealed); await load(); }
    finally { setBusy(false); }
  };

  const unsealed = items.filter((i) => !i.hash).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Fingerprint className="text-belota-gold w-5 h-5" /> Cadeia de Evidências</h2>
          <p className="text-sm text-belota-muted">Hash SHA-256 encadeado — trilha imutável para auditorias TCE/ANPD (Evidence by Design).</p>
        </div>
        <div className="flex gap-2">
          {unsealed > 0 && canCreate && <button className={btnGold} onClick={seal} disabled={busy}><Lock className="w-4 h-4" /> Selar {unsealed} antiga(s)</button>}
          <button className={btnGold} onClick={verify} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Verificar integridade</button>
        </div>
      </div>

      {report && (
        <Card className={report.intact ? "" : "border-red-600"}>
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className={report.intact ? "text-emerald-400 w-5 h-5" : "text-red-400 w-5 h-5"} />
            {report.intact ? `Cadeia íntegra — ${report.checked} evidências verificadas` : `Divergências: ${report.broken.length}`}
          </div>
          {!report.intact && <pre className="text-xs mt-2 whitespace-pre-wrap">{JSON.stringify(report.broken, null, 2)}</pre>}
        </Card>
      )}
      {sealed !== null && <Card className="text-sm">🔒 {sealed} registro(s) selado(s) com hash.</Card>}

      {canCreate && (
        <Card className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input className={field} placeholder="Título da evidência" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input className={field} placeholder="Módulo (ex.: treinamento)" value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} />
            <input className={field} placeholder="Referência / link" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <textarea rows={2} className={field} placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button className={btnGold} onClick={create}>Registrar com hash</button>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((e) => (
          <Card key={e.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold">{e.title}</span>
                  {e.module && <Badge tone="gold">{e.module}</Badge>}
                  <Badge tone={e.hash ? "green" : "neutral"}>{e.hash ? "selada" : "sem hash"}</Badge>
                </div>
                <p className="text-sm text-belota-muted">{e.description}</p>
                {e.reference && <p className="text-xs text-belota-muted mt-1">Ref: {e.reference}</p>}
              </div>
              <div className="text-right text-xs text-belota-muted">
                <div>{new Date(e.created_at).toLocaleDateString("pt-BR")}</div>
                {e.hash && <div className="font-mono text-belota-gold mt-1">#{e.hash.slice(0, 12)}…</div>}
              </div>
            </div>
          </Card>
        ))}
        {items.length === 0 && <Card className="text-center text-belota-muted py-10">Nenhuma evidência registrada.</Card>}
      </div>
    </div>
  );
}