import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Badge, Card } from "../components/ui-belota";
import { Landmark, Sparkles, Loader2, Trash2, Upload, FileText } from "lucide-react";

const field = "w-full bg-belota-elevated border border-belota-border rounded p-2 text-sm text-belota-text placeholder:text-belota-muted focus:outline-none focus:border-belota-gold [&>option]:text-gray-900";
const btnGold = "inline-flex items-center gap-2 px-4 py-2 bg-belota-gold text-black text-sm font-semibold rounded hover:opacity-90 disabled:opacity-50";
const btnGhost = "inline-flex items-center gap-2 px-3 py-2 text-sm text-belota-muted hover:text-belota-text";
const EL = { apta: "text-emerald-400", apta_com_restricoes: "text-amber-400", inapta: "text-red-400" };

export default function Licitations({ companyId, canCreate }) {
  const [items, setItems] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ edital_text: "", orgao: "", modalidade: "pregao", numero: "", deadline: "" });

  const load = () => api.get(`/companies/${companyId}/licitations`).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [companyId]);

  const create = async () => {
    if (!form.edital_text.trim()) { alert("Cole o texto do edital ou envie o arquivo"); return; }
    await api.post(`/companies/${companyId}/licitations`, form);
    setShowNew(false); load();
  };

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("orgao", form.orgao); fd.append("modalidade", form.modalidade);
      fd.append("numero", form.numero); fd.append("deadline", form.deadline);
      await api.post(`/companies/${companyId}/licitations/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setShowNew(false); load();
    } catch (err) { alert((err.response && err.response.data && err.response.data.detail) || "Falha no upload"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const analyze = async (id) => {
    setBusy(id);
    try {
      const { data } = await api.post(`/companies/${companyId}/licitations/${id}/ai-analyze`);
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const j = await api.get(`/companies/${companyId}/jobs/${data.job_id}`);
        if (j.data.status === "done" || j.data.status === "error") break;
      }
      load();
    } finally { setBusy(null); }
  };

  const del = async (id) => { if (confirm("Excluir edital?")) { await api.delete(`/companies/${companyId}/licitations/${id}`); load(); } };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Landmark className="text-belota-gold w-5 h-5" /> Licitation Engine</h2>
          <p className="text-sm text-belota-muted">Envie o edital (PDF/DOCX/TXT) e receba a análise de requisitos LGPD, evidências exigidas, gaps e elegibilidade — o suporte a licitações do DPO as a Service™.</p>
        </div>
        {canCreate && <button className={btnGold} onClick={() => setShowNew(!showNew)}><FileText className="w-4 h-4" /> Novo Edital</button>}
      </div>

      {showNew && (
        <Card className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <input className={field} placeholder="Órgão" value={form.orgao} onChange={(e) => setForm({ ...form, orgao: e.target.value })} />
            <select className={field} value={form.modalidade} onChange={(e) => setForm({ ...form, modalidade: e.target.value })}>
              <option value="pregao">Pregão</option><option value="concorrencia">Concorrência</option>
              <option value="dispensa">Dispensa</option><option value="chamamento">Chamamento</option>
            </select>
            <input className={field} placeholder="Número" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            <input className={field} type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </div>
          <textarea rows={8} className={field} placeholder="...ou cole o texto do edital" value={form.edital_text} onChange={(e) => setForm({ ...form, edital_text: e.target.value })} />
          <div className="flex gap-2 flex-wrap">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-belota-border rounded text-sm text-belota-text cursor-pointer hover:border-belota-gold">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Extraindo..." : "Enviar arquivo do edital"}
              <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={onFile} />
            </label>
            <button className={btnGold} onClick={create}>Salvar</button>
            <button className={btnGhost} onClick={() => setShowNew(false)}>Cancelar</button>
          </div>
        </Card>
      )}

      {items.map((c) => (
        <Card key={c.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="cursor-pointer flex-1" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge tone="gold">{c.modalidade}</Badge>
                {c.file_name && <Badge tone="neutral">📎 {c.file_name}</Badge>}
                {c.eligibility && <span className={`text-xs font-bold ${EL[c.eligibility] || ""}`}>{c.eligibility.replace("_", " ")}</span>}
                <Badge tone={c.status === "analisado" ? "green" : "neutral"}>{c.status}</Badge>
              </div>
              <div className="font-semibold">{c.orgao || "Órgão não informado"} {c.numero && `· ${c.numero}`}</div>
              <p className="text-sm text-belota-muted mt-1">{(c.edital_text || "").substring(0, 140)}...</p>
            </div>
            {canCreate && (
              <div className="flex gap-1">
                {c.status !== "analisado" && (
                  <button className={btnGold} disabled={busy === c.id} onClick={() => analyze(c.id)}>
                    {busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analisar IA
                  </button>
                )}
                <button className={btnGhost} onClick={() => del(c.id)}><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
          {open === c.id && c.recommendations && (
            <pre className="mt-4 p-4 bg-belota-bg border border-belota-border rounded text-sm text-belota-text whitespace-pre-wrap max-h-96 overflow-y-auto">{c.recommendations}</pre>
          )}
        </Card>
      ))}
      {items.length === 0 && <Card className="text-center text-belota-muted py-10">Nenhum edital cadastrado.</Card>}
    </div>
  );
}