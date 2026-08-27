import React, { useEffect, useState } from "react";
import { api, fmtErr } from "../../lib/api";
import { Card, Stat, ScoreRing, Badge, EmptyState } from "../../components/ui-belota";
import { toast } from "sonner";
import { FileText, ShieldAlert, ListChecks, Users } from "lucide-react";

const MODULES = [
  { key: "inventory", label: "Itens de Inventário", tab: "Inventários" },
  { key: "ropa", label: "Registros RoPA", tab: "RoPA" },
  { key: "ripd", label: "Relatórios RIPD", tab: "RIPD" },
  { key: "documents", label: "Documentos", tab: "Documentos" },
  { key: "trainings", label: "Treinamentos", tab: "Treinamentos" },
  { key: "evidences", label: "Evidências", tab: "Evidências" },
  { key: "tickets", label: "Tickets de Titular", tab: "Tickets" },
];

export default function Overview({ companyId, onGoTab }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get(`/companies/${companyId}/dashboard`).then((r) => setD(r.data)).catch((e) => toast.error(fmtErr(e)));
  }, [companyId]);
  if (!d) return <div className="text-belota-muted">Carregando visão geral...</div>;

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <Card overline="Compliance by Design" title="Score de Conformidade" className="flex flex-col items-center justify-center">
          <ScoreRing score={d.compliance_score} />
          <p className="text-xs text-belota-muted mt-4 text-center">
            {d.compliance_score >= 70 ? "Elegível para certificação VERIFIED™" : "Continue o programa para atingir 70%"}
          </p>
        </Card>

        <Card overline="Risk by Design" title="Maturidade por Domínio" className="lg:col-span-2">
          {d.domain_scores.length === 0 ? (
            <EmptyState title="Diagnóstico pendente" hint="Realize o diagnóstico adaptativo para gerar a análise por domínio." />
          ) : (
            <div className="space-y-3 mt-2">
              {d.domain_scores.map((ds) => (
                <div key={ds.domain}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-belota-text">{ds.domain}</span>
                    <span className="font-mono text-belota-gold">{ds.score}%</span>
                  </div>
                  <div className="h-2 bg-belota-bg rounded-full overflow-hidden">
                    <div className="h-full transition-all rounded-full"
                      style={{ width: `${ds.score}%`, background: ds.score >= 80 ? "#185C42" : ds.score >= 50 ? "#C5A059" : "#8B2323" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Riscos Mapeados" value={d.risks.length} sub={`${d.critical_risks} críticos`} accent={d.critical_risks > 0} />
        <Stat label="Ações Abertas" value={d.open_actions} sub={`${d.total_actions} no total`} />
        <Stat label="Documentos" value={d.counts.documents} sub="gerados" />
        <Stat label="Certificação" value={d.certificate ? "Emitida" : "—"} sub="Selo VERIFIED™" accent={!!d.certificate} />
      </div>

      <Card overline="Fluxo Integrado" title="Módulos do Programa">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {MODULES.map((m) => (
            <button key={m.key} onClick={() => onGoTab(m.tab)}
              className="text-left p-4 rounded-sm bg-belota-bg border border-belota-border hover:border-belota-gold/40 transition-colors">
              <div className="font-heading text-2xl font-bold text-belota-gold">{d.counts[m.key] ?? 0}</div>
              <div className="text-sm text-belota-muted mt-1">{m.label}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
