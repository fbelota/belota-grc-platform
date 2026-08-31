import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Badge, Card } from "../components/ui-belota";
import { FileText, Sparkles, Loader2, Shield, Trash2, Upload } from "lucide-react";

const field = "w-full bg-belota-elevated border border-belota-border rounded p-2 text-sm text-belota-text placeholder:text-belota-muted focus:outline-none focus:border-belota-gold [&>option]:text-gray-900";
const btnGold = "inline-flex items-center gap-2 px-4 py-2 bg-belota-gold text-black text-sm font-semibold rounded hover:opacity-90 disabled:opacity-50";
const btnGhost = "inline-flex items-center gap-2 px-3 py-2 text-sm text-belota-muted hover:text-belota-text";

export default function ContractReview({ companyId, canCreate }) {
  const [items, setItems] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ contract_text: "", contract_type: "prestacao_servico", counterparty: "" });

  const load = () => api.get(`/companies/${companyId}/contracts`).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [companyId]);

  const create = async () => {
    if (!form.contract_text.trim()) { alert("Cole o texto do contrato ou envie um arquivo"); return; }
    await api.post(`/companies/${companyId}/contracts`, form);
    setForm({ contract_text: "", contract_type: "prestacao_servico", counterparty: "" });
    setShowNew(false);
    load();
  };

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("contract_type", form.contract_type);
      fd.append("counterparty", form.counterparty);
      await api.post(`/companies/${companyId}/contracts/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setShowNew(false);
      load();
    } catch (err) {
      alert((err.response && err.response.data && err.response.data.detail) || "Falha no upload do arquivo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const analyze = async (id) => {
    setBusy(id);
    try {
      const { data } = await api.post(`/companies/${companyId}/contracts/${id}/ai-analyze`);
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const j = await api.get(`/companies/${companyId}/jobs/${data.job_id}`);
        if (j.data.status === "done" || j.data.status === "error") break;
      }
      load();
    } finally { setBusy(null); }
  };

  const del = async (id) => {
    if (confirm("Excluir contrato?")) { await api.delete(`/companies/${companyId}/contracts/${id}`); load(); }
  };

  const rc = { alto: "text-red-400", medio: "text-amber-400", baixo: "text-emerald-400" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Shield className="text-belota-gold w-5 h-5" /> Revisão Contratual Estratégica</h2>
          <p className="text-sm text-belota-muted">Envie o arquivo do contrato (PDF/DOCX/TXT) ou cole o texto, e clique em “Analisar IA” para receber o parecer com riscos LGPD e redlines.</p>
        </div>
        {canCreate && <button className={btnGold} onClick={() => setShowNew(!showNew)}><FileText className="w-4 h-4" /> Novo Contrato</button>}
      </div>

      {showNew && (
        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select className={field} value={form.contract_type} onChange={(e) => setForm({ ...form, contract_type: e.target.value })}>
              <option value="prestacao_servico">Prestação de Serviços</option>
              <option value="desenvolvimento">Desenvolvimento de Software</option>
              <option value="licenciamento">Licenciamento</option>
              <option value="fornecedor">Fornecedor/Operador</option>
              <option value="dpa">DPA</option>
            </select>
            <input className={field} placeholder="Contraparte" value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
          </div>
          <textarea rows={8} className={field} placeholder="...ou cole aqui o texto integral do contrato" value={form.contract_text} onChange={(e) => setForm({ ...form, contract_text: e.target.value })} />
          <div className="flex items-center gap-2 flex-wrap">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-belota-border rounded text-sm text-belota-text cursor-pointer hover:border-belota-gold">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Extraindo texto do arquivo..." : "Enviar arquivo (PDF/DOCX/TXT)"}
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
                <Badge tone="gold">{c.contract_type.replace("_", " ")}</Badge>
                {c.file_name && <Badge tone="neutral">📎 {c.file_name}</Badge>}
                {c.risk_level && <span className={`text-xs font-bold ${rc[c.risk_level] || ""}`}>risco {c.risk_level}</span>}
                <Badge tone={c.status === "analisado" ? "green" : "neutral"}>{c.status}</Badge>
              </div>
              <div className="font-semibold">{c.counterparty || "Contrato"} · {new Date(c.created_at).toLocaleDateString("pt-BR")}</div>
              <p className="text-sm text-belota-muted mt-1">{(c.contract_text || "").substring(0, 140)}...</p>
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
      {items.length === 0 && (
        <Card className="text-center text-belota-muted py-10">Nenhum contrato cadastrado. Use “Novo Contrato” para começar.</Card>
      )}
    </div>
  );
}
