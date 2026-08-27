import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtErr } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { PageHeader, Badge, EmptyState } from "../components/ui-belota";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Building2, ShieldCheck } from "lucide-react";

const STAGE_LABEL = { lead: "Lead", proposta: "Proposta", negociacao: "Negociação", fechado: "Fechado", onboarding: "Onboarding", ativo: "Ativo" };
const STAGE_TONE = { lead: "neutral", proposta: "gold", negociacao: "gold", fechado: "green", onboarding: "green", ativo: "green" };

export default function Companies() {
  const { user } = useAuth();
  const nav = useNavigate();
  const isStaff = ["admin", "consultor", "dpo"].includes(user?.role);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", cnpj: "", sector: "", size: "", contact_name: "", contact_email: "", contact_phone: "", stage: "lead", plan: "premium", notes: "" });

  const load = () => api.get("/companies").then((r) => setItems(r.data)).catch((e) => toast.error(fmtErr(e)));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!isStaff && items.length === 1) nav(`/empresas/${items[0].id}`, { replace: true });
  }, [items, isStaff, nav]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/companies", form);
      toast.success("Empresa cadastrada");
      setOpen(false);
      setForm({ name: "", cnpj: "", sector: "", size: "", contact_name: "", contact_email: "", contact_phone: "", stage: "lead", plan: "premium", notes: "" });
      await load();
      nav(`/empresas/${data.id}`);
    } catch (e) { toast.error(fmtErr(e)); } finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader overline="CRM · Onboarding · Governança"
        title={isStaff ? "Empresas" : "Minha Empresa"}
        desc="Cada cadastro alimenta automaticamente diagnóstico, inventários, RoPA, riscos, documentos e certificação."
        actions={isStaff && (
          <Button data-testid="new-company-btn" onClick={() => setOpen(true)}
            className="bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">
            <Plus className="w-4 h-4 mr-1" /> Nova Empresa
          </Button>
        )} />

      {items.length === 0 ? (
        <EmptyState title="Nenhuma empresa cadastrada" hint={isStaff ? "Cadastre a primeira empresa para iniciar o programa de governança." : "Aguarde o vínculo do seu consultor."} />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((c) => (
            <button key={c.id} data-testid="company-card" onClick={() => nav(`/empresas/${c.id}`)}
              className="text-left bg-belota-surface border border-belota-border rounded-md p-5 hover:border-belota-gold/40 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-sm bg-belota-elevated flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-belota-gold" />
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge tone={STAGE_TONE[c.stage]}>{STAGE_LABEL[c.stage] || c.stage}</Badge>
                  {c.certified && <Badge tone="gold"><ShieldCheck className="w-3 h-3 mr-1" />VERIFIED™</Badge>}
                </div>
              </div>
              <h3 className="font-heading font-semibold text-lg group-hover:text-belota-gold transition-colors">{c.name}</h3>
              <p className="text-sm text-belota-muted">{c.sector || "Setor não informado"}</p>
              <div className="mt-4 pt-4 border-t border-belota-border flex justify-between items-center">
                <span className="text-xs text-belota-muted">Conformidade</span>
                <span className="font-mono text-belota-gold">{c.compliance_score || 0}%</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-belota-surface border-belota-border text-belota-text max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin">
          <DialogHeader><DialogTitle className="font-heading">Nova Empresa</DialogTitle></DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label className="text-belota-muted">Razão Social</Label>
                <Input data-testid="company-name-input" value={form.name} onChange={set("name")} required className="bg-belota-bg border-belota-border mt-1" /></div>
              <div><Label className="text-belota-muted">CNPJ</Label>
                <Input value={form.cnpj} onChange={set("cnpj")} className="bg-belota-bg border-belota-border mt-1" /></div>
              <div><Label className="text-belota-muted">Setor</Label>
                <Input value={form.sector} onChange={set("sector")} className="bg-belota-bg border-belota-border mt-1" placeholder="Tecnologia, Saúde..." /></div>
              <div><Label className="text-belota-muted">Porte</Label>
                <Input value={form.size} onChange={set("size")} className="bg-belota-bg border-belota-border mt-1" placeholder="PME, Grande..." /></div>
              <div><Label className="text-belota-muted">Estágio</Label>
                <select value={form.stage} onChange={set("stage")} className="w-full mt-1 bg-belota-bg border border-belota-border rounded-sm h-10 px-3 text-sm">
                  {Object.entries(STAGE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
              <div><Label className="text-belota-muted">Contato</Label>
                <Input value={form.contact_name} onChange={set("contact_name")} className="bg-belota-bg border-belota-border mt-1" /></div>
              <div><Label className="text-belota-muted">E-mail</Label>
                <Input value={form.contact_email} onChange={set("contact_email")} className="bg-belota-bg border-belota-border mt-1" /></div>
              <div className="col-span-2"><Label className="text-belota-muted">Observações</Label>
                <Textarea value={form.notes} onChange={set("notes")} className="bg-belota-bg border-belota-border mt-1" /></div>
            </div>
            <Button data-testid="save-company-btn" type="submit" disabled={saving}
              className="w-full bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">
              {saving ? "Salvando..." : "Cadastrar Empresa"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
