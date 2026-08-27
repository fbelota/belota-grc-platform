import React, { useEffect, useState } from "react";
import { api, fmtErr, pollJob } from "../../lib/api";
import { Card, Badge, EmptyState } from "../../components/ui-belota";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, Loader2, Trash2, FileText } from "lucide-react";

export default function Ripd({ companyId, canCreate }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const [gen, setGen] = useState({ title: "", scope: "", risk_level: "medium" });
  const [loading, setLoading] = useState(false);

  const load = () => api.get(`/companies/${companyId}/ripd`).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [companyId]);

  const generate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post(`/companies/${companyId}/ripd/ai-generate`, gen);
      await pollJob(companyId, data.job_id);
      toast.success("RIPD gerado por IA");
      setOpen(false);
      setGen({ title: "", scope: "", risk_level: "medium" });
      await load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setLoading(false); }
  };

  const del = async (id) => { await api.delete(`/companies/${companyId}/ripd/${id}`); load(); };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="overline mb-1">Relatório de Impacto à Proteção de Dados</div>
          <h2 className="font-heading text-xl font-semibold">RIPD / DPIA</h2>
          <p className="text-sm text-belota-muted mt-1">Avaliação de impacto para tratamentos de alto risco.</p>
        </div>
        {canCreate && (
          <Button data-testid="ripd-generate-btn" onClick={() => setOpen(true)}
            className="bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">
            <Sparkles className="w-4 h-4 mr-1" /> Gerar RIPD com IA
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nenhum RIPD gerado" hint="Gere um relatório de impacto assistido por IA." />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((r) => (
            <Card key={r.id} className="cursor-pointer hover:border-belota-gold/40 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3" onClick={() => setView(r)}>
                  <FileText className="w-5 h-5 text-belota-gold shrink-0" />
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-belota-muted mt-0.5">{r.scope}</div>
                  </div>
                </div>
                {canCreate && <button onClick={() => del(r.id)} className="text-belota-muted hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge tone={r.risk_level === "high" ? "high" : r.risk_level === "low" ? "green" : "gold"}>Risco {r.risk_level}</Badge>
                <button onClick={() => setView(r)} className="text-xs text-belota-gold hover:underline ml-auto">Visualizar →</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-belota-surface border-belota-border text-belota-text max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">Gerar RIPD com IA</DialogTitle></DialogHeader>
          <form onSubmit={generate} className="space-y-4">
            <div><Label className="text-belota-muted">Título</Label>
              <Input value={gen.title} onChange={(e) => setGen({ ...gen, title: e.target.value })} required className="bg-belota-bg border-belota-border mt-1" placeholder="RIPD - Tratamento de dados de clientes" /></div>
            <div><Label className="text-belota-muted">Escopo / Atividade avaliada</Label>
              <Input value={gen.scope} onChange={(e) => setGen({ ...gen, scope: e.target.value })} className="bg-belota-bg border-belota-border mt-1" placeholder="Ex.: processamento em nuvem de dados de saúde" /></div>
            <div><Label className="text-belota-muted">Nível de risco estimado</Label>
              <select value={gen.risk_level} onChange={(e) => setGen({ ...gen, risk_level: e.target.value })} className="w-full mt-1 bg-belota-bg border border-belota-border rounded-sm h-10 px-3 text-sm">
                <option value="low">Baixo</option><option value="medium">Médio</option><option value="high">Alto</option>
              </select></div>
            <Button type="submit" disabled={loading} className="w-full bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">
              {loading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Gerando (pode levar alguns segundos)...</> : "Gerar Relatório"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!view} onOpenChange={() => setView(null)}>
        <DialogContent className="bg-belota-surface border-belota-border text-belota-text max-w-3xl max-h-[85vh] overflow-y-auto scrollbar-thin">
          <DialogHeader><DialogTitle className="font-serif text-2xl">{view?.title}</DialogTitle></DialogHeader>
          <div className="prose-belota text-sm whitespace-pre-wrap">{view?.content}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
