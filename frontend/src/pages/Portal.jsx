import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Badge, Card, ScoreRing, Stat, PageHeader } from "../components/ui-belota";
import { Building2, Download, ShieldCheck, AlertTriangle, ClipboardList, Landmark } from "lucide-react";

export default function Portal() {
  const { user } = useAuth();
  if (user?.role === "cliente") return <ClientPortal />;
  return <StaffPortal isDpo={user?.role === "dpo"} />;
}

function ClientPortal() {
  const nav = useNavigate();
  const [cid, setCid] = useState(null);
  const [dash, setDash] = useState(null);
  const [prog, setProg] = useState(null);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    api.get("/companies").then(async (r) => {
      const c = r.data[0];
      if (!c) return;
      setCid(c.id);
      const [d, p, rep] = await Promise.all([
        api.get(`/companies/${c.id}/dashboard`).catch(() => null),
        api.get(`/companies/${c.id}/roadmap/progress`).catch(() => null),
        api.get(`/companies/${c.id}/dpo/reports`).catch(() => ({ data: [] })),
      ]);
      setDash(d?.data); setProg(p?.data); setReports(rep?.data || []);
    });
  }, []);

  if (!cid) return <Card className="text-center text-belota-muted py-10">Carregando seu ambiente...</Card>;

  return (
    <div className="space-y-6">
      <PageHeader overline="Portal do Cliente" title="Sua governança em tempo real" desc="Conformidade, certificação e o serviço DPO as a Service™ da sua empresa." />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="flex items-center justify-center"><ScoreRing score={dash?.compliance_score || 0} size={120} /></Card>
        <Stat label="Certificação" value={dash?.certificate ? "VERIFIED™" : "Pendente"} accent={!!dash?.certificate} sub={dash?.certificate ? `Validade ${new Date(dash.certificate.valid_until).toLocaleDateString("pt-BR")}` : "Conclua o programa"} />
        <Stat label="Roadmap 15 dias" value={`${prog?.progress_pct || 0}%`} sub={`${prog?.completed || 0}/${prog?.total || 0} atividades`} />
        <Stat label="Riscos críticos" value={dash?.critical_risks ?? 0} accent={(dash?.critical_risks || 0) === 0} sub={dash?.critical_risks ? "Requer atenção" : "Sob controle"} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card overline="Certificado" title="Selo BELOTA GRC VERIFIED™">
          {dash?.certificate ? (
            <button onClick={() => window.open(`/api/companies/${cid}/certificate/pdf`)} className="inline-flex items-center gap-2 px-4 py-2 bg-belota-gold text-black text-sm font-semibold rounded"><Download className="w-4 h-4" /> Baixar certificado PDF</button>
          ) : <p className="text-sm text-belota-muted">Emitido automaticamente ao atingir 70% de conformidade.</p>}
        </Card>
        <Card overline="DPO as a Service™" title="Relatórios Audit Ready">
          {reports.length ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold">{reports[0].title}</div>
              <button onClick={() => window.open(`/api/companies/${cid}/dpo/reports/${reports[0].id}/pdf`)} className="inline-flex items-center gap-2 px-4 py-2 bg-belota-gold text-black text-sm font-semibold rounded"><Download className="w-4 h-4" /> PDF do último relatório</button>
            </div>
          ) : <p className="text-sm text-belota-muted">Nenhum relatório mensal gerado ainda.</p>}
        </Card>
      </div>
      <button onClick={() => nav(`/empresas/${cid}`)} className="text-sm text-belota-gold hover:underline">Acessar ambiente completo da empresa →</button>
    </div>
  );
}

function StaffPortal({ isDpo }) {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [queue, setQueue] = useState(null);

  useEffect(() => {
    api.get("/portal/staff").then((r) => setRows(r.data));
    if (isDpo) api.get("/portal/dpo").then((r) => setQueue(r.data));
  }, [isDpo]);

  return (
    <div className="space-y-6">
      <PageHeader overline={isDpo ? "Portal do DPO" : "Portal do Consultor"} title="Carteira de clientes e alertas" desc="Visão consolidada multi-cliente da carteira BELOTA." />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((c) => (
          <Card key={c.company_id} className="cursor-pointer hover:border-belota-gold/60">
            <div onClick={() => nav(`/empresas/${c.company_id}`)}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-heading font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-belota-gold" /> {c.name}</span>
                {c.certified && <Badge tone="gold"><ShieldCheck className="w-3 h-3" /> VERIFIED™</Badge>}
              </div>
              <div className="flex items-center gap-4 text-sm mb-3">
                <span className="text-belota-gold font-bold">{c.score}%</span>
                <span className="text-belota-muted">{c.stage}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {c.critical_risks > 0 && <Badge tone="critical"><AlertTriangle className="w-3 h-3" /> {c.critical_risks} críticos</Badge>}
                {c.overdue_tasks > 0 && <Badge tone="high">{c.overdue_tasks} atrasadas</Badge>}
                {c.open_tickets > 0 && <Badge tone="medium">{c.open_tickets} tickets</Badge>}
                {c.contracts_pending > 0 && <Badge tone="neutral">{c.contracts_pending} contratos</Badge>}
                {c.licit_pending > 0 && <Badge tone="neutral"><Landmark className="w-3 h-3" /> {c.licit_pending} editais</Badge>}
                {!c.critical_risks && !c.overdue_tasks && !c.open_tickets && <Badge tone="green">Em dia</Badge>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {isDpo && queue && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card overline="Fila DPO" title="Atividades pendentes da carteira">
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {queue.tasks.slice(0, 20).map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm border-b border-belota-border pb-2">
                  <div><ClipboardList className="w-3 h-3 inline text-belota-gold mr-1" /> {t.company_name} — {t.title}</div>
                  <span className="text-xs text-belota-muted">{new Date(t.due_date).toLocaleDateString("pt-BR")}</span>
                </div>
              ))}
              {queue.tasks.length === 0 && <p className="text-sm text-belota-muted">Nenhuma atividade pendente.</p>}
            </div>
          </Card>
          <Card overline="Titulares" title="Tickets abertos na carteira">
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {queue.tickets.map((t) => (
                <div key={t.id} className="text-sm border-b border-belota-border pb-2">
                  <span className="font-mono text-xs text-belota-gold">{t.protocol}</span> {t.company_name} — {t.request_type} ({t.requester_name})
                </div>
              ))}
              {queue.tickets.length === 0 && <p className="text-sm text-belota-muted">Nenhum ticket aberto.</p>}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}