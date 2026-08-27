import React, { useEffect, useState } from "react";
import { api, fmtErr, pollJob } from "../../lib/api";
import { Card, Badge, EmptyState } from "../../components/ui-belota";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, Loader2, Trash2, FileText } from "lucide-react";

export default function Documents({ companyId, canCreate }) {
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const [gen, setGen] = useState({ doc_type: "", instructions: "" });
  const [loading, setLoading] = useState(false);

  const load = () => api.get(`/companies/${companyId}/documents`).then((r) => setItems(r.data));
  useEffect(() => {
    load();
    api.get("/documents/catalog").then((r) => { setCatalog(r.data); setGen((g) => ({ ...g, doc_type: r.data[0]?.type || "" })); });
  }, [companyId]);

  const generate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post(`/companies/${companyId}/documents/generate`, gen);
      await pollJob(companyId, data.job_id);
      toast.success("Documento gerado por IA");
      setOpen(false); setGen({ ...gen, instructions: "" });
      await load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setLoading(false); }
  };
  const del = async (id) => { await api.delete(`/companies/${companyId}/documents/${id}`); load(); };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="overline mb-1">Document by Design</div>
          <h2 className="font-heading text-xl font-semibold">Documentos & Políticas</h2>
          <p className="text-sm text-belota-muted mt-1">Políticas, códigos, planos e contratos gerados por IA conforme a LGPD.</p>
        </div>
        {canCreate && (
          <Button data-testid="doc-generate-btn" onClick={() => setOpen(true)} className="bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">
            <Sparkles className="w-4 h-4 mr-1" /> Gerar Documento
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nenhum documento gerado" hint="Gere políticas e contratos assistidos por IA." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((d) => (
            <Card key={d.id} className="hover:border-belota-gold/40 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 cursor-pointer" onClick={() => setView(d)}>
                  <div className="w-10 h-10 rounded-sm bg-belota-elevated flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-belota-gold" /></div>
                  <div>
                    <div className="font-medium text-sm leading-snug">{d.title}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      {d.generated_by_ai && <Badge tone="gold"><Sparkles className="w-3 h-3 mr-1" />IA</Badge>}
                      <Badge tone={d.status === "aprovado" ? "green" : "neutral"}>{d.status}</Badge>
                    </div>
                  </div>
                </div>
                {canCreate && <button onClick={() => del(d.id)} className="text-belota-muted hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
              </div>
              <button onClick={() => setView(d)} className="text-xs text-belota-gold hover:underline mt-3">Abrir documento →</button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-belota-surface border-belota-border text-belota-text max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">Gerar Documento com IA</DialogTitle></DialogHeader>
          <form onSubmit={generate} className="space-y-4">
            <div><Label className="text-belota-muted">Tipo de documento</Label>
              <select value={gen.doc_type} onChange={(e) => setGen({ ...gen, doc_type: e.target.value })} className="w-full mt-1 bg-belota-bg border border-belota-border rounded-sm h-10 px-3 text-sm">
                {catalog.map((c) => <option key={c.type} value={c.type}>{c.name}</option>)}
              </select></div>
            <div><Label className="text-belota-muted">Instruções adicionais (opcional)</Label>
              <Textarea value={gen.instructions} onChange={(e) => setGen({ ...gen, instructions: e.target.value })} className="bg-belota-bg border-belota-border mt-1" placeholder="Ex.: incluir cláusula específica sobre retenção de logs" /></div>
            <Button type="submit" disabled={loading} className="w-full bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">
              {loading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Gerando documento...</> : "Gerar com IA"}
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
