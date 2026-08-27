import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtErr } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { PageHeader, Stat, Card, Badge, EmptyState } from "../components/ui-belota";
import { toast } from "sonner";
import { Building2, ShieldCheck, TrendingUp, ArrowRight } from "lucide-react";

const STAGE_LABEL = { lead: "Lead", proposta: "Proposta", negociacao: "Negociação", fechado: "Fechado", onboarding: "Onboarding", ativo: "Ativo" };
const STAGES = Object.keys(STAGE_LABEL);

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data)).catch((e) => toast.error(fmtErr(e)));
  }, []);

  if (!data) return <div className="text-belota-muted">Carregando painel...</div>;

  return (
    <div>
      <PageHeader overline="Painel Executivo de Governança"
        title={`Olá, ${user?.name?.split(" ")[0]}`}
        desc="Visão consolidada do portfólio de conformidade, riscos e certificações sob sua gestão." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Empresas" value={data.total_companies} sub="no portfólio" />
        <Stat label="Conformidade Média" value={`${data.avg_score}%`} accent sub="score consolidado" />
        <Stat label="Certificadas" value={data.certified} sub="Selo VERIFIED™" />
        <Stat label="Em Onboarding" value={(data.by_stage?.onboarding || 0) + (data.by_stage?.ativo || 0)} sub="programas ativos" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card overline="Pipeline Comercial" title="Funil CRM" className="lg:col-span-1">
          <div className="space-y-3 mt-2">
            {STAGES.map((s) => {
              const n = data.by_stage?.[s] || 0;
              const pct = data.total_companies ? (n / data.total_companies) * 100 : 0;
              return (
                <div key={s}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-belota-muted">{STAGE_LABEL[s]}</span>
                    <span className="font-mono text-belota-text">{n}</span>
                  </div>
                  <div className="h-1.5 bg-belota-bg rounded-full overflow-hidden">
                    <div className="h-full bg-belota-gold transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card overline="Portfólio" title="Empresas & Conformidade" className="lg:col-span-2">
          {data.companies.length === 0 ? (
            <EmptyState title="Nenhuma empresa cadastrada" hint="Cadastre sua primeira empresa no módulo CRM." />
          ) : (
            <div className="space-y-2">
              {data.companies.slice(0, 8).map((c) => (
                <button key={c.id} data-testid="dash-company-row" onClick={() => nav(`/empresas/${c.id}`)}
                  className="w-full flex items-center justify-between p-3 rounded-sm bg-belota-bg border border-belota-border hover:border-belota-gold/40 transition-colors group text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-sm bg-belota-elevated flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-belota-gold" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{c.name}</div>
                      <div className="text-xs text-belota-muted">{c.sector || "—"} · {STAGE_LABEL[c.stage] || c.stage}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {c.certified && <Badge tone="gold"><ShieldCheck className="w-3 h-3 mr-1" />VERIFIED</Badge>}
                    <div className="flex items-center gap-1.5 text-sm">
                      <TrendingUp className="w-3.5 h-3.5 text-belota-gold" />
                      <span className="font-mono">{c.compliance_score || 0}%</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-belota-muted group-hover:text-belota-gold transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
