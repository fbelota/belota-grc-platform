import React, { useState } from "react";
import { api, fmtErr, pollJob } from "../../lib/api";
import CrudSection from "../../components/CrudSection";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";

const LEGAL = [
  "Consentimento", "Cumprimento de obrigação legal", "Execução de contrato",
  "Legítimo interesse", "Exercício regular de direitos", "Proteção da vida", "Tutela da saúde",
];

export default function Ropa({ companyId, canCreate }) {
  const [aiOpen, setAiOpen] = useState(false);
  const [ai, setAi] = useState("");
  const [loading, setLoading] = useState(false);

  const suggest = async () => {
    setLoading(true);
    setAiOpen(true);
    setAi("");
    try {
      const { data } = await api.post(`/companies/${companyId}/ropa/ai-suggest`);
      const result = await pollJob(companyId, data.job_id);
      setAi(result.suggestion);
    } catch (e) { toast.error(fmtErr(e)); setAiOpen(false); } finally { setLoading(false); }
  };

  return (
    <>
      <CrudSection companyId={companyId} path="ropa" canCreate={canCreate}
        overline="Registro de Operações de Tratamento" title="RoPA"
        desc="Registro das Atividades de Tratamento de Dados Pessoais conforme Art. 37 da LGPD."
        aiButton={canCreate && (
          <Button data-testid="ropa-ai-btn" onClick={suggest} variant="outline"
            className="border-belota-border bg-transparent hover:bg-belota-elevated rounded-sm">
            <Sparkles className="w-4 h-4 mr-1 text-belota-gold" /> Sugerir com IA
          </Button>
        )}
        config={{
          columns: [
            { key: "process_name", label: "Processo", render: (r) => <span className="font-medium">{r.process_name}</span> },
            { key: "purpose", label: "Finalidade" },
            { key: "legal_basis", label: "Base Legal" },
            { key: "retention", label: "Retenção" },
          ],
          fields: [
            { name: "process_name", label: "Nome do Processo", full: true, required: true },
            { name: "purpose", label: "Finalidade", type: "textarea", full: true },
            { name: "legal_basis", label: "Base Legal", type: "select", options: LEGAL.map((l) => ({ value: l, label: l })), default: "Consentimento" },
            { name: "data_categories", label: "Categorias de Dados" },
            { name: "data_subjects", label: "Titulares" },
            { name: "retention", label: "Prazo de Retenção" },
            { name: "recipients", label: "Destinatários" },
            { name: "international_transfer", label: "Transferência Internacional", type: "checkbox" },
            { name: "security_measures", label: "Medidas de Segurança", type: "textarea", full: true },
          ],
        }} />

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="bg-belota-surface border-belota-border text-belota-text max-w-2xl max-h-[80vh] overflow-y-auto scrollbar-thin">
          <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><Sparkles className="w-4 h-4 text-belota-gold" /> Sugestões de RoPA (IA)</DialogTitle></DialogHeader>
          {loading ? (
            <div className="flex items-center gap-2 text-belota-muted py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Gerando sugestões...</div>
          ) : (
            <pre className="text-xs whitespace-pre-wrap font-mono text-belota-muted bg-belota-bg p-4 rounded-sm border border-belota-border">{ai}</pre>
          )}
          <p className="text-xs text-belota-muted">Copie os registros sugeridos e cadastre via "Adicionar".</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
