import React, { useEffect, useState } from "react";
import { api, fmtErr } from "../../lib/api";
import { Card, Badge, EmptyState } from "../../components/ui-belota";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const LEVELS = [1, 2, 3, 4, 5];
function cellColor(p, i) {
  const s = p * i;
  if (s >= 15) return "#631212";
  if (s >= 10) return "#8B2323";
  if (s >= 5) return "#C5A059";
  return "#185C42";
}
function scoreTone(s) { return s >= 15 ? "critical" : s >= 10 ? "high" : s >= 5 ? "gold" : "green"; }

export default function Risks({ companyId, canCreate, onChanged }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", category: "", description: "", probability: 3, impact: 3, treatment: "mitigar", treatment_plan: "", status: "aberto", owner: "" });

  const load = () => api.get(`/companies/${companyId}/risks`).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [companyId]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/companies/${companyId}/risks`, { ...form, probability: Number(form.probability), impact: Number(form.impact) });
      toast.success("Risco registrado");
      setOpen(false);
      setForm({ title: "", category: "", description: "", probability: 3, impact: 3, treatment: "mitigar", treatment_plan: "", status: "aberto", owner: "" });
      await load(); onChanged && onChanged();
    } catch (e) { toast.error(fmtErr(e)); } finally { setSaving(false); }
  };
  const del = async (id) => { await api.delete(`/companies/${companyId}/risks/${id}`); load(); onChanged && onChanged(); };

  const cellRisks = (p, i) => items.filter((r) => r.probability === p && r.impact === i);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="overline mb-1">Risk by Design</div>
          <h2 className="font-heading text-xl font-semibold">Matriz de Riscos GRC</h2>
          <p className="text-sm text-belota-muted mt-1">Probabilidade × Impacto. Identificação proativa de gargalos.</p>
        </div>
        {canCreate && (
          <Button data-testid="add-risk-btn" onClick={() => setOpen(true)} className="bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">
            <Plus className="w-4 h-4 mr-1" /> Registrar Risco
          </Button>
        )}
      </div>

      <Card overline="Heatmap 5×5" title="Matriz Probabilidade × Impacto">
        <div className="flex gap-2">
          <div className="flex flex-col justify-between py-2 pr-2 text-xs text-belota-muted" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
            <span>Probabilidade →</span>
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-5 gap-1.5">
              {[5, 4, 3, 2, 1].map((p) =>
                LEVELS.map((i) => {
                  const rs = cellRisks(p, i);
                  return (
                    <div key={`${p}-${i}`} data-testid={`risk-cell-${p}-${i}`}
                      className="aspect-square rounded-sm flex items-center justify-center text-belota-bg font-bold text-sm relative"
                      style={{ background: cellColor(p, i), opacity: rs.length ? 1 : 0.35 }}>
                      {rs.length > 0 && <span className="font-heading">{rs.length}</span>}
                    </div>
                  );
                })
              )}
            </div>
            <div className="text-center text-xs text-belota-muted mt-2">Impacto →</div>
          </div>
        </div>
        <div className="flex gap-4 mt-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#185C42" }} /> Baixo</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#C5A059" }} /> Médio</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#8B2323" }} /> Alto</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#631212" }} /> Crítico</span>
        </div>
      </Card>

      {items.length === 0 ? (
        <EmptyState title="Nenhum risco mapeado" hint="Registre riscos para popular a matriz." />
      ) : (
        <div className="bg-belota-surface border border-belota-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-belota-border text-belota-muted">
              {["Risco", "Categoria", "P×I", "Nível", "Tratamento", "Status", ""].map((h) => <th key={h} className="text-left px-4 py-3 overline">{h}</th>)}
            </tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} data-testid="risk-row" className="border-b border-belota-border/60 hover:bg-belota-elevated transition-colors">
                  <td className="px-4 py-3 font-medium">{r.title}</td>
                  <td className="px-4 py-3 text-belota-muted">{r.category || "—"}</td>
                  <td className="px-4 py-3 font-mono">{r.probability}×{r.impact}</td>
                  <td className="px-4 py-3"><Badge tone={scoreTone(r.score)}>{r.score}</Badge></td>
                  <td className="px-4 py-3 text-belota-muted">{r.treatment}</td>
                  <td className="px-4 py-3"><Badge tone={r.status === "tratado" ? "green" : "neutral"}>{r.status}</Badge></td>
                  <td className="px-4 py-3 text-right">{canCreate && <button onClick={() => del(r.id)} className="text-belota-muted hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-belota-surface border-belota-border text-belota-text max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin">
          <DialogHeader><DialogTitle className="font-heading">Registrar Risco</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div><Label className="text-belota-muted">Título</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="bg-belota-bg border-belota-border mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-belota-muted">Categoria</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-belota-bg border-belota-border mt-1" placeholder="Segurança, Jurídico..." /></div>
              <div><Label className="text-belota-muted">Responsável</Label>
                <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="bg-belota-bg border-belota-border mt-1" /></div>
              <div><Label className="text-belota-muted">Probabilidade (1-5)</Label>
                <select value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} className="w-full mt-1 bg-belota-bg border border-belota-border rounded-sm h-10 px-3 text-sm">{LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
              <div><Label className="text-belota-muted">Impacto (1-5)</Label>
                <select value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} className="w-full mt-1 bg-belota-bg border border-belota-border rounded-sm h-10 px-3 text-sm">{LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
              <div><Label className="text-belota-muted">Tratamento</Label>
                <select value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })} className="w-full mt-1 bg-belota-bg border border-belota-border rounded-sm h-10 px-3 text-sm">
                  <option value="mitigar">Mitigar</option><option value="aceitar">Aceitar</option><option value="transferir">Transferir</option><option value="evitar">Evitar</option></select></div>
              <div><Label className="text-belota-muted">Status</Label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full mt-1 bg-belota-bg border border-belota-border rounded-sm h-10 px-3 text-sm">
                  <option value="aberto">Aberto</option><option value="em_tratamento">Em tratamento</option><option value="tratado">Tratado</option></select></div>
            </div>
            <div><Label className="text-belota-muted">Plano de Tratamento</Label>
              <Textarea value={form.treatment_plan} onChange={(e) => setForm({ ...form, treatment_plan: e.target.value })} className="bg-belota-bg border-belota-border mt-1" /></div>
            <Button type="submit" disabled={saving} className="w-full bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">{saving ? "Salvando..." : "Salvar Risco"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
