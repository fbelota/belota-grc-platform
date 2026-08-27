import React, { useEffect, useState } from "react";
import { api, fmtErr } from "../../lib/api";
import { Badge, EmptyState } from "../../components/ui-belota";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const TYPE_LABEL = { acesso: "Acesso aos dados", correcao: "Correção", exclusao: "Exclusão", portabilidade: "Portabilidade", revogacao: "Revogação de consentimento", oposicao: "Oposição" };

export default function Tickets({ companyId, isStaff }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ requester_name: "", requester_email: "", request_type: "acesso", description: "" });

  const load = () => api.get(`/companies/${companyId}/tickets`).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [companyId]);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/companies/${companyId}/tickets`, form);
      toast.success("Solicitação registrada");
      setOpen(false); setForm({ requester_name: "", requester_email: "", request_type: "acesso", description: "" });
      await load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setSaving(false); }
  };

  const setStatus = async (t, status) => {
    try { await api.put(`/companies/${companyId}/tickets/${t.id}`, { status }); load(); }
    catch (e) { toast.error(fmtErr(e)); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="overline mb-1">Portal do Titular</div>
          <h2 className="font-heading text-xl font-semibold">Solicitações de Titulares</h2>
          <p className="text-sm text-belota-muted mt-1">Atendimento a direitos dos titulares (Art. 18 LGPD) com protocolo e prazo.</p>
        </div>
        <Button data-testid="add-ticket-btn" onClick={() => setOpen(true)} className="bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">
          <Plus className="w-4 h-4 mr-1" /> Nova Solicitação
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nenhuma solicitação" hint="Registre pedidos de titulares de dados." />
      ) : (
        <div className="bg-belota-surface border border-belota-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-belota-border text-belota-muted">
              {["Protocolo", "Titular", "Tipo", "Status", "Data", isStaff ? "Ações" : ""].map((h) => <th key={h} className="text-left px-4 py-3 overline">{h}</th>)}
            </tr></thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} data-testid="ticket-row" className="border-b border-belota-border/60 hover:bg-belota-elevated transition-colors">
                  <td className="px-4 py-3 font-mono text-belota-gold">{t.protocol}</td>
                  <td className="px-4 py-3">{t.requester_name}</td>
                  <td className="px-4 py-3 text-belota-muted">{TYPE_LABEL[t.request_type] || t.request_type}</td>
                  <td className="px-4 py-3"><Badge tone={t.status === "concluido" ? "green" : t.status === "em_andamento" ? "gold" : "neutral"}>{t.status}</Badge></td>
                  <td className="px-4 py-3 text-belota-muted">{new Date(t.created_at).toLocaleDateString("pt-BR")}</td>
                  {isStaff && (
                    <td className="px-4 py-3">
                      <select value={t.status} onChange={(e) => setStatus(t, e.target.value)}
                        className="bg-belota-bg border border-belota-border rounded-sm h-8 px-2 text-xs">
                        <option value="aberto">Aberto</option><option value="em_andamento">Em andamento</option><option value="concluido">Concluído</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-belota-surface border-belota-border text-belota-text max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">Nova Solicitação de Titular</DialogTitle></DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div><Label className="text-belota-muted">Nome do titular</Label>
              <Input value={form.requester_name} onChange={(e) => setForm({ ...form, requester_name: e.target.value })} required className="bg-belota-bg border-belota-border mt-1" /></div>
            <div><Label className="text-belota-muted">E-mail</Label>
              <Input value={form.requester_email} onChange={(e) => setForm({ ...form, requester_email: e.target.value })} className="bg-belota-bg border-belota-border mt-1" /></div>
            <div><Label className="text-belota-muted">Tipo de solicitação</Label>
              <select value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })} className="w-full mt-1 bg-belota-bg border border-belota-border rounded-sm h-10 px-3 text-sm">
                {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div><Label className="text-belota-muted">Descrição</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-belota-bg border-belota-border mt-1" /></div>
            <Button type="submit" disabled={saving} className="w-full bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">{saving ? "Registrando..." : "Registrar Solicitação"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
