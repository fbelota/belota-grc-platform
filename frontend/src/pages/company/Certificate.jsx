import React, { useEffect, useState } from "react";
import { api, fmtErr } from "../../lib/api";
import { Shield } from "../../components/Logo";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Lock } from "lucide-react";

export default function Certificate({ company, isStaff, onChanged }) {
  const [cert, setCert] = useState(undefined); // undefined loading, null none
  const [loading, setLoading] = useState(false);

  const load = () =>
    api.get(`/companies/${company.id}/certificate`).then((r) => setCert(r.data)).catch(() => setCert(null));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [company.id]);

  const issue = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/companies/${company.id}/certificate`);
      setCert(data);
      toast.success("Certificado emitido — Selo VERIFIED™");
      onChanged && onChanged();
    } catch (e) { toast.error(fmtErr(e)); } finally { setLoading(false); }
  };

  const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

  if (cert === undefined) return <div className="text-belota-muted">Carregando...</div>;

  return (
    <div className="max-w-3xl">
      <div className="overline mb-1">Certification Engine</div>
      <h2 className="font-heading text-xl font-semibold mb-6">Certificado & Selo Digital</h2>

      {cert ? (
        <div className="relative bg-belota-surface border-2 border-belota-gold/40 rounded-md p-10 grain overflow-hidden"
          style={{ background: "linear-gradient(135deg,#0B1426,#050A14)" }}>
          <div className="absolute top-6 right-6 opacity-20"><Shield className="w-28 h-28" /></div>
          <div className="relative z-10 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-full border-2 border-belota-gold flex items-center justify-center">
                <ShieldCheck className="w-10 h-10 text-belota-gold" />
              </div>
            </div>
            <div className="overline">BELOTA GRC · Conformidade Validada</div>
            <h3 className="font-serif text-3xl font-bold text-belota-gold mt-2">CERTIFICADO</h3>
            <p className="font-serif text-lg text-belota-text">BELOTA GRC VERIFIED™</p>
            <p className="text-belota-muted mt-6 text-sm">A BELOTA GRC confere à organização</p>
            <p className="font-serif text-2xl text-belota-text mt-1">{company.name}</p>
            <p className="text-belota-muted text-sm mt-1 font-mono">{company.cnpj || "CNPJ não informado"}</p>
            <p className="text-belota-muted mt-6 text-sm max-w-lg mx-auto">
              por concluir o Programa de Adequação à LGPD, Governança, Risco e Compliance,
              implementando os controles mínimos da metodologia BELOTA GRC Framework™.
            </p>
            <div className="flex justify-center gap-10 mt-8 text-sm">
              <div><div className="overline">Emissão</div><div className="font-mono">{fmt(cert.issued_at)}</div></div>
              <div><div className="overline">Validade</div><div className="font-mono">{fmt(cert.valid_until)}</div></div>
              <div><div className="overline">Score</div><div className="font-mono text-belota-gold">{cert.score}%</div></div>
            </div>
            <div className="mt-6 inline-block px-4 py-1.5 rounded-sm bg-belota-bg border border-belota-border font-mono text-xs text-belota-gold">
              {cert.certificate_id}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-belota-surface border border-belota-border rounded-md p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-belota-elevated flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-belota-muted" />
          </div>
          <h3 className="font-heading text-lg">Certificado não emitido</h3>
          <p className="text-belota-muted text-sm mt-2 max-w-md mx-auto">
            Score atual: <span className="text-belota-gold font-mono">{company.compliance_score || 0}%</span>.
            É necessário atingir no mínimo <span className="text-belota-gold">70%</span> de conformidade no diagnóstico.
          </p>
          {isStaff && (
            <Button data-testid="issue-cert-btn" onClick={issue} disabled={loading || (company.compliance_score || 0) < 70}
              className="mt-6 bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm disabled:opacity-40">
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
              Emitir Certificado VERIFIED™
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
