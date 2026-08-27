import React, { useEffect, useState } from "react";
import { api, fmtErr, pollJob } from "../../lib/api";
import { Card, Badge } from "../../components/ui-belota";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { Sparkles, Loader2, CheckCircle2 } from "lucide-react";

const OPTIONS = [
  { value: "sim", label: "Sim", tone: "green" },
  { value: "parcial", label: "Parcial", tone: "gold" },
  { value: "nao", label: "Não", tone: "high" },
];

export default function Diagnostic({ companyId, isStaff, onChanged }) {
  const [template, setTemplate] = useState([]);
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(0);
  const [saving, setSaving] = useState(false);
  const [ai, setAi] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    api.get("/diagnostic/template").then((r) => setTemplate(r.data));
    api.get(`/companies/${companyId}/diagnostic`).then((r) => {
      setAnswers(r.data.answers || {});
      setScore(r.data.score || 0);
    });
  }, [companyId]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/companies/${companyId}/diagnostic`, { answers });
      setScore(data.score);
      toast.success(`Diagnóstico salvo — conformidade ${data.score}%`);
      onChanged && onChanged();
    } catch (e) { toast.error(fmtErr(e)); } finally { setSaving(false); }
  };

  const genAi = async () => {
    setAiLoading(true);
    setAi("");
    try {
      const { data } = await api.post(`/companies/${companyId}/diagnostic/ai-recommendations`);
      const result = await pollJob(companyId, data.job_id);
      setAi(result.recommendations);
      toast.success("Recomendações geradas por IA");
    } catch (e) { toast.error(fmtErr(e)); } finally { setAiLoading(false); }
  };

  const answered = Object.keys(answers).length;
  const total = template.reduce((a, d) => a + d.questions.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="overline mb-1">Diagnóstico Adaptativo LGPD</div>
          <h2 className="font-heading text-xl font-semibold">Avaliação de Maturidade</h2>
          <p className="text-sm text-belota-muted mt-1">{answered}/{total} respondidas · Score atual {score}%</p>
        </div>
        {isStaff && (
          <div className="flex gap-2">
            <Button data-testid="ai-recommend-btn" onClick={genAi} disabled={aiLoading}
              variant="outline" className="border-belota-border bg-transparent hover:bg-belota-elevated rounded-sm">
              {aiLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1 text-belota-gold" />}
              Recomendações IA
            </Button>
            <Button data-testid="save-diagnostic-btn" onClick={save} disabled={saving}
              className="bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">
              {saving ? "Salvando..." : "Salvar Diagnóstico"}
            </Button>
          </div>
        )}
      </div>

      {template.map((domain) => (
        <Card key={domain.domain} overline="Domínio" title={domain.domain}>
          <div className="space-y-3">
            {domain.questions.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-4 py-2 border-b border-belota-border/50 last:border-0">
                <span className="text-sm text-belota-text">{q.text}</span>
                <div className="flex gap-1.5 shrink-0">
                  {OPTIONS.map((o) => (
                    <button key={o.value} data-testid={`diag-${q.id}-${o.value}`}
                      disabled={!isStaff}
                      onClick={() => setAnswers({ ...answers, [q.id]: o.value })}
                      className={`px-3 py-1 rounded-sm text-xs border transition-colors ${
                        answers[q.id] === o.value
                          ? o.tone === "green" ? "bg-risk-low/30 border-risk-low text-emerald-200"
                            : o.tone === "gold" ? "bg-belota-gold/20 border-belota-gold text-belota-gold"
                            : "bg-risk-high/30 border-risk-high text-red-200"
                          : "border-belota-border text-belota-muted hover:text-belota-text"}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {ai && (
        <Card overline="AI by Design" title="Plano de Recomendações">
          <div className="prose-belota text-sm whitespace-pre-wrap">{ai}</div>
        </Card>
      )}
    </div>
  );
}
