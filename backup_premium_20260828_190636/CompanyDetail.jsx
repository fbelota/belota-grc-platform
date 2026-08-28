import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, fmtErr } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Badge } from "../components/ui-belota";
import { Shield } from "../components/Logo";
import CrudSection from "../components/CrudSection";
import Overview from "./company/Overview";
import Diagnostic from "./company/Diagnostic";
import Inventory from "./company/Inventory";
import Ropa from "./company/Ropa";
import Ripd from "./company/Ripd";
import Risks from "./company/Risks";
import Documents from "./company/Documents";
import Certificate from "./company/Certificate";
import Tickets from "./company/Tickets";
import { ArrowLeft, ShieldCheck } from "lucide-react";

const TABS = [
  "Visão Geral", "Diagnóstico", "Inventários", "RoPA", "RIPD", "Riscos",
  "Plano de Ação", "Documentos", "Treinamentos", "Evidências", "Tickets", "Certificado", "Auditoria",
];

export default function CompanyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isStaff = ["admin", "consultor", "dpo"].includes(user?.role);
  const [company, setCompany] = useState(null);
  const [tab, setTab] = useState("Visão Geral");
  const [refresh, setRefresh] = useState(0);

  const loadCompany = () =>
    api.get(`/companies/${id}`).then((r) => setCompany(r.data)).catch((e) => { toast.error(fmtErr(e)); nav("/empresas"); });
  useEffect(() => { loadCompany(); /* eslint-disable-next-line */ }, [id, refresh]);

  if (!company) return <div className="text-belota-muted">Carregando empresa...</div>;
  const bump = () => setRefresh((r) => r + 1);

  return (
    <div>
      <button onClick={() => nav("/empresas")} className="flex items-center gap-2 text-belota-muted hover:text-belota-text text-sm mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-md bg-belota-surface border border-belota-border flex items-center justify-center">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <div className="overline mb-1">{company.sector || "Programa de Governança Premium"}</div>
            <h1 className="font-heading text-3xl font-bold tracking-tight">{company.name}</h1>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-belota-muted">
              <span className="font-mono">{company.cnpj || "CNPJ não informado"}</span>
              {company.certified && <Badge tone="gold"><ShieldCheck className="w-3 h-3 mr-1" />BELOTA GRC VERIFIED™</Badge>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="overline mb-1">Conformidade</div>
          <div className="font-heading text-4xl font-bold text-belota-gold">{company.compliance_score || 0}%</div>
        </div>
      </div>

      <div className="border-b border-belota-border mb-6 overflow-x-auto scrollbar-thin">
        <div className="flex gap-1 min-w-max">
          {TABS.map((t) => (
            <button key={t} data-testid={`tab-${t}`} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                tab === t ? "border-belota-gold text-belota-gold" : "border-transparent text-belota-muted hover:text-belota-text"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="animate-fade-up">
        {tab === "Visão Geral" && <Overview companyId={id} onGoTab={setTab} />}
        {tab === "Diagnóstico" && <Diagnostic companyId={id} isStaff={isStaff} onChanged={bump} />}
        {tab === "Inventários" && <Inventory companyId={id} canCreate={isStaff} />}
        {tab === "RoPA" && <Ropa companyId={id} canCreate={isStaff} />}
        {tab === "RIPD" && <Ripd companyId={id} canCreate={isStaff} />}
        {tab === "Riscos" && <Risks companyId={id} canCreate={isStaff} onChanged={bump} />}
        {tab === "Plano de Ação" && (
          <CrudSection companyId={id} path="actions" canCreate={isStaff}
            overline="Roadmap de Governança" title="Plano de Ação e Tratamento"
            desc="Ações priorizadas para elevar a maturidade de conformidade."
            config={{
              columns: [
                { key: "title", label: "Ação", render: (r) => <span className="font-medium">{r.title}</span> },
                { key: "owner", label: "Responsável" },
                { key: "priority", label: "Prioridade", render: (r) => <Badge tone={r.priority === "alta" ? "high" : r.priority === "media" ? "gold" : "neutral"}>{r.priority}</Badge> },
                { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "concluida" ? "green" : "neutral"}>{r.status}</Badge> },
                { key: "due_date", label: "Prazo" },
              ],
              fields: [
                { name: "title", label: "Ação", full: true, required: true },
                { name: "description", label: "Descrição", type: "textarea", full: true },
                { name: "owner", label: "Responsável" },
                { name: "due_date", label: "Prazo", type: "date" },
                { name: "priority", label: "Prioridade", type: "select", options: [{ value: "alta", label: "Alta" }, { value: "media", label: "Média" }, { value: "baixa", label: "Baixa" }], default: "media" },
                { name: "status", label: "Status", type: "select", options: [{ value: "pendente", label: "Pendente" }, { value: "em_andamento", label: "Em andamento" }, { value: "concluida", label: "Concluída" }], default: "pendente" },
              ],
            }} />
        )}
        {tab === "Documentos" && <Documents companyId={id} canCreate={isStaff} />}
        {tab === "Treinamentos" && (
          <CrudSection companyId={id} path="trainings" canCreate={isStaff}
            overline="Capacitação" title="Treinamentos"
            desc="Conscientização em LGPD, segurança e ética para colaboradores."
            config={{
              columns: [
                { key: "title", label: "Treinamento", render: (r) => <span className="font-medium">{r.title}</span> },
                { key: "audience", label: "Público" },
                { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "concluido" ? "green" : "neutral"}>{r.status}</Badge> },
                { key: "completion", label: "Conclusão", render: (r) => `${r.completion || 0}%` },
              ],
              fields: [
                { name: "title", label: "Título", full: true, required: true },
                { name: "audience", label: "Público-alvo" },
                { name: "completion", label: "% Conclusão", type: "number", default: 0 },
                { name: "description", label: "Descrição", type: "textarea", full: true },
                { name: "status", label: "Status", type: "select", options: [{ value: "planejado", label: "Planejado" }, { value: "em_andamento", label: "Em andamento" }, { value: "concluido", label: "Concluído" }], default: "planejado" },
              ],
            }} />
        )}
        {tab === "Evidências" && (
          <CrudSection companyId={id} path="evidences" canCreate={isStaff}
            overline="Evidence by Design" title="Gestão de Evidências"
            desc="Cada ação gera evidência rastreável para auditorias e certificações."
            config={{
              columns: [
                { key: "title", label: "Evidência", render: (r) => <span className="font-medium">{r.title}</span> },
                { key: "module", label: "Módulo" },
                { key: "reference", label: "Referência", render: (r) => <span className="font-mono text-xs">{r.reference || "—"}</span> },
                { key: "created_at", label: "Registro", render: (r) => new Date(r.created_at).toLocaleDateString("pt-BR") },
              ],
              fields: [
                { name: "title", label: "Título", full: true, required: true },
                { name: "module", label: "Módulo relacionado" },
                { name: "reference", label: "Referência / Link" },
                { name: "description", label: "Descrição", type: "textarea", full: true },
              ],
            }} />
        )}
        {tab === "Tickets" && <Tickets companyId={id} isStaff={isStaff} />}
        {tab === "Certificado" && <Certificate company={company} isStaff={isStaff} onChanged={bump} />}
        {tab === "Auditoria" && (
          <CrudSection companyId={id} path="events" canCreate={false}
            overline="Audit by Design" title="Trilha de Auditoria"
            desc="Histórico imutável de todas as ações realizadas na plataforma."
            config={{
              columns: [
                { key: "created_at", label: "Data", render: (r) => new Date(r.created_at).toLocaleString("pt-BR") },
                { key: "user_name", label: "Usuário" },
                { key: "action", label: "Ação", render: (r) => <Badge tone="gold">{r.action}</Badge> },
                { key: "entity", label: "Entidade" },
                { key: "detail", label: "Detalhe" },
              ],
              fields: [],
            }} />
        )}
      </div>
    </div>
  );
}
