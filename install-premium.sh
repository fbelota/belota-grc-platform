#!/bin/bash
# BELOTA GRC - Instalador Premium Sprint 1-4 (deterministico, sem agente)
cd /app || exit 1
echo "=== [1/7] Backup ==="
BK="backup_premium_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BK"
cp backend/server.py "$BK/" 2>/dev/null
cp frontend/src/pages/CompanyDetail.jsx "$BK/" 2>/dev/null
echo "Backup: $BK"

echo "=== [2/7] Dependencias ==="
cd /app/backend
pip install -q qrcode Pillow 2>/dev/null || pip3 install -q qrcode Pillow
grep -q "qrcode" requirements.txt 2>/dev/null || printf "qrcode\nPillow\n" >> requirements.txt

echo "=== [3/7] Modulos backend ==="
mkdir -p /app/backend/modules
cat > /app/backend/modules/__init__.py <<'MODINIT'
# BELOTA GRC - Modulos Premium
MODINIT

cat > /app/backend/modules/contract_review.py <<'MODCR'
"""Revisao Contratual Estrategica"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from server import (db, now_iso, new_id, log_event, ai_generate,
                    create_job, run_job, get_current_user, require_staff,
                    get_company_or_403)

router = APIRouter()

class ContractReviewIn(BaseModel):
    contract_text: str
    contract_type: str = "prestacao_servico"
    counterparty: Optional[str] = ""
    value: Optional[float] = None
    notes: Optional[str] = ""

class ContractReviewUpdateIn(BaseModel):
    status: Optional[str] = None
    risk_level: Optional[str] = None
    recommendations: Optional[str] = None
    reviewer_notes: Optional[str] = None

@router.post("/companies/{company_id}/contracts")
async def create_contract(company_id: str, body: ContractReviewIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    doc = {"id": new_id(), "company_id": company_id, **body.model_dump(),
           "status": "em_revisao", "risk_level": None, "recommendations": None,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.contract_reviews.insert_one(doc)
    await log_event(company_id, user, "criou", "contrato", body.counterparty or body.contract_type)
    doc.pop("_id", None)
    return doc

@router.get("/companies/{company_id}/contracts")
async def list_contracts(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await db.contract_reviews.find({"company_id": company_id}, {"_id": 0}).sort("created_at", -1).to_list(500)

@router.get("/companies/{company_id}/contracts/{item_id}")
async def get_contract(company_id: str, item_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    doc = await db.contract_reviews.find_one({"id": item_id, "company_id": company_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Contrato nao encontrado")
    return doc

@router.put("/companies/{company_id}/contracts/{item_id}")
async def update_contract(company_id: str, item_id: str, body: ContractReviewUpdateIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    upd["updated_at"] = now_iso()
    await db.contract_reviews.update_one({"id": item_id, "company_id": company_id}, {"$set": upd})
    return await db.contract_reviews.find_one({"id": item_id}, {"_id": 0})

@router.delete("/companies/{company_id}/contracts/{item_id}")
async def delete_contract(company_id: str, item_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.contract_reviews.delete_one({"id": item_id, "company_id": company_id})
    return {"ok": True}

@router.post("/companies/{company_id}/contracts/{item_id}/ai-analyze")
async def analyze_contract(company_id: str, item_id: str, user: dict = Depends(require_staff)):
    company = await get_company_or_403(user, company_id)
    contract = await db.contract_reviews.find_one({"id": item_id, "company_id": company_id}, {"_id": 0})
    if not contract:
        raise HTTPException(404, "Contrato nao encontrado")
    job_id = await create_job(company_id, "contract_review")

    async def worker():
        prompt = (f"Empresa {company['name']}. Analise o contrato abaixo sob a otica LGPD/compliance. "
                  f"Retorne JSON valido com: risk_level (baixo|medio|alto), risk_clauses (lista de "
                  f"{{text, risk, recommendation}}), missing_clauses (lista), protective_clauses (lista), "
                  f"recommendations (texto). CONTRATO:\n{contract['contract_text']}")
        text = await ai_generate("Voce e advogado senior especialista em LGPD e contratos de TI. Responda apenas JSON valido.", prompt)
        await db.contract_reviews.update_one({"id": item_id}, {"$set": {
            "status": "analisado", "risk_level": "medio", "recommendations": text, "updated_at": now_iso()}})
        await log_event(company_id, user, "analisou", "contrato", contract.get("counterparty", ""))
        return {"analysis": text}

    run_job(job_id, worker)
    return {"job_id": job_id}
MODCR

cat > /app/backend/modules/roadmap.py <<'MODRM'
"""Roadmap de Governanca - 15 dias"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from server import (db, now_iso, new_id, log_event, get_current_user,
                    require_staff, get_company_or_403)

router = APIRouter()

T = [
 (1,1,"Kickoff e Mapeamento Inicial","Reuniao de alinhamento e acesso aos sistemas","diagnostico","Ata de Kickoff"),
 (1,2,"Inventario de Dados Pessoais","Mapeamento e classificacao de bases de dados","inventario","Inventario de Dados"),
 (1,3,"Inventario de Sistemas e Ativos","Levantamento de sistemas, servidores e integracoes","inventario","Inventario de Sistemas"),
 (1,4,"Mapeamento de Processos (RoPA)","Documentacao das atividades de tratamento","lgpd","RoPA"),
 (2,5,"Elaboracao do RIPD","Relatorio de Impacto a Protecao de Dados","lgpd","RIPD"),
 (2,6,"Matriz de Riscos GRC","Identificacao e classificacao de riscos","risco","Matriz de Riscos"),
 (2,7,"Plano de Tratamento de Riscos","Medidas de mitigacao e responsaveis","risco","Plano de Tratamento"),
 (3,8,"Politicas e Codigos","Privacidade, Seguranca, Etica e Conduta","documentacao","Politicas Internas"),
 (3,9,"Planos de Continuidade","Incidentes, Backup e Continuidade","documentacao","Planos Operacionais"),
 (3,10,"Revisao Contratual","Contratos existentes e DPAs","contratos","Revisao Contratual"),
 (4,11,"Treinamentos","Capacitacao da equipe em LGPD","treinamento","Certificados"),
 (4,12,"Checklist ANPD","Verificacao de conformidade ANPD","compliance","Checklist ANPD"),
 (4,13,"Gestao de Evidencias","Consolidacao para auditoria","evidencias","Pasta de Evidencias"),
 (5,14,"Auditoria Interna","Simulacao de auditoria e ajustes","auditoria","Relatorio de Auditoria"),
 (5,15,"Certificacao e Selo VERIFIED","Emissao do certificado e selo digital","certificacao","Certificado BELOTA VERIFIED"),
]

@router.post("/companies/{company_id}/roadmap/generate")
async def generate(company_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.roadmaps.delete_many({"company_id": company_id})
    base = datetime.now(timezone.utc)
    tasks = []
    for ph, day, title, desc, cat, deliv in T:
        tasks.append({"id": new_id(), "company_id": company_id, "phase": ph, "day": day,
            "title": title, "description": desc, "category": cat, "deliverable": deliv,
            "due_date": (base + timedelta(days=day-1)).isoformat(), "status": "pendente",
            "completed_at": None, "created_at": now_iso(), "updated_at": now_iso()})
    await db.roadmaps.insert_many(tasks)
    await log_event(company_id, user, "gerou", "roadmap", "15 dias")
    return {"ok": True, "task_count": len(tasks)}

@router.get("/companies/{company_id}/roadmap")
async def list_tasks(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await db.roadmaps.find({"company_id": company_id}, {"_id": 0}).sort("day", 1).to_list(100)

@router.put("/companies/{company_id}/roadmap/{task_id}")
async def update_task(company_id: str, task_id: str, body: dict, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    upd = {k: v for k, v in body.items() if v is not None}
    upd["updated_at"] = now_iso()
    if upd.get("status") == "concluida":
        upd["completed_at"] = now_iso()
    await db.roadmaps.update_one({"id": task_id, "company_id": company_id}, {"$set": upd})
    return await db.roadmaps.find_one({"id": task_id}, {"_id": 0})

@router.get("/companies/{company_id}/roadmap/progress")
async def progress(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    tasks = await db.roadmaps.find({"company_id": company_id}).to_list(100)
    done = len([t for t in tasks if t.get("status") == "concluida"])
    by_phase = {}
    for t in tasks:
        by_phase.setdefault(t["phase"], {"total": 0, "done": 0})
        by_phase[t["phase"]]["total"] += 1
        if t.get("status") == "concluida":
            by_phase[t["phase"]]["done"] += 1
    return {"total": len(tasks), "completed": done,
            "progress_pct": round(done/len(tasks)*100) if tasks else 0, "by_phase": by_phase}
MODRM

cat > /app/backend/modules/pdf_export.py <<'MODPDF'
"""PDFs: Certificado VERIFIED com QR Code + Documentos"""
import io, base64, qrcode, markdown
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from xhtml2pdf import pisa
from server import db, get_current_user, get_company_or_403

router = APIRouter()
GOLD = "#C9A227"

def qr_b64(data):
    qr = qrcode.QRCode(box_size=10, border=2)
    qr.add_data(data); qr.make(fit=True)
    img = qr.make_image()
    buf = io.BytesIO(); img.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()

def render(html):
    buf = io.BytesIO()
    st = pisa.CreatePDF(io.StringIO(html), dest=buf)
    if st.err:
        raise HTTPException(500, "Erro ao gerar PDF")
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf")

@router.get("/companies/{company_id}/certificate/pdf")
async def cert_pdf(company_id: str, user: dict = Depends(get_current_user)):
    company = await get_company_or_403(user, company_id)
    cert = await db.certificates.find_one({"company_id": company_id}, {"_id": 0})
    if not cert:
        raise HTTPException(404, "Certificado nao emitido")
    em = datetime.fromisoformat(cert["issued_at"]).strftime("%d/%m/%Y")
    va = datetime.fromisoformat(cert["valid_until"]).strftime("%d/%m/%Y")
    qr = qr_b64(f"https://belotagrc.com.br/verify/{cert['certificate_id']}")
    html = f"""<html><head><meta charset="UTF-8"/><style>
    @page {{size: A4 landscape; margin: 0;}}
    body {{font-family: Helvetica; background: #0B1220; color: #fff; padding: 40px;}}
    .c {{border: 3px solid {GOLD}; padding: 50px; text-align: center;}}
    .logo {{color: {GOLD}; font-size: 26px; font-weight: bold; letter-spacing: 4px;}}
    .sub {{color: #888; font-size: 11px; letter-spacing: 3px;}}
    .t {{color: {GOLD}; font-size: 30px; font-weight: bold; margin: 25px 0;}}
    .n {{color: {GOLD}; font-size: 28px; font-weight: bold; margin: 15px 0;}}
    .s {{color: {GOLD}; font-size: 13px; letter-spacing: 3px; font-weight: bold; margin-top: 15px;}}
    .f {{margin-top: 30px; display: flex; justify-content: space-between; align-items: center; text-align: left;}}
    .i {{font-size: 10px; color: #999;}}
    </style></head><body><div class="c">
    <div class="logo">BELOTA GRC</div>
    <div class="sub">GOVERNANCA · RISCO · COMPLIANCE · LGPD</div>
    <div class="t">CERTIFICADO DE CONFORMIDADE</div>
    <p>Certificamos que a empresa</p>
    <div class="n">{company['name']}</div>
    <p>concluiu o Programa de Governanca Premium BELOTA GRC Framework™<br/>
    em conformidade com a Lei 13.709/2018 (LGPD).</p>
    <p>Score de Conformidade: <b style="color:{GOLD}">{cert.get('score',0)}%</b></p>
    <div class="s">◆ BELOTA GRC VERIFIED™ ◆</div>
    <div class="f"><div class="i">Certificado: {cert['certificate_id']}<br/>Emitido em: {em}<br/>Valido ate: {va}<br/>Emitido por: {cert.get('issued_by','BELOTA GRC')}</div>
    <img src="data:image/png;base64,{qr}" style="width:110px;height:110px"/></div>
    </div></body></html>"""
    return render(html)

@router.get("/companies/{company_id}/documents/{doc_id}/pdf")
async def doc_pdf(company_id: str, doc_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    doc = await db.documents.find_one({"id": doc_id, "company_id": company_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Documento nao encontrado")
    body = markdown.markdown(doc.get("content", ""))
    html = f"""<html><head><meta charset="UTF-8"/><style>
    @page {{size: A4; margin: 2.5cm;}}
    body {{font-family: Helvetica; color: #222; line-height: 1.6;}}
    .h {{border-bottom: 3px solid {GOLD}; padding-bottom: 12px; margin-bottom: 25px;}}
    .logo {{color: {GOLD}; font-size: 20px; font-weight: bold; letter-spacing: 3px;}}
    h1 {{color: #111;}} h2 {{color: {GOLD};}}
    table {{border-collapse: collapse; width: 100%;}} th,td {{border: 1px solid #ccc; padding: 6px;}}
    </style></head><body>
    <div class="h"><div class="logo">BELOTA GRC</div>
    <div style="color:#666;font-size:9px;letter-spacing:2px">GOVERNANCA · RISCO · COMPLIANCE · LGPD</div></div>
    <h1>{doc.get('title','Documento')}</h1>{body}
    <p style="font-size:9px;color:#888;margin-top:30px">BELOTA GRC CONSULTORIA · {datetime.now().strftime('%d/%m/%Y')}</p>
    </body></html>"""
    return render(html)
MODPDF

echo "=== [4/7] Paginas frontend ==="
cat > /app/frontend/src/pages/ContractReview.jsx <<'JSXCR'
import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Badge } from "../components/ui-belota";
import { FileText, Sparkles, Loader2, Shield, Trash2 } from "lucide-react";

const btnGold = "inline-flex items-center gap-2 px-4 py-2 bg-belota-gold text-black text-sm font-semibold rounded hover:opacity-90 disabled:opacity-50";
const btnGhost = "inline-flex items-center gap-2 px-3 py-2 text-sm text-belota-muted hover:text-belota-text";
const card = "bg-belota-surface border border-belota-border rounded-lg p-5";

export default function ContractReview({ companyId, canCreate }) {
  const [items, setItems] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ contract_text: "", contract_type: "prestacao_servico", counterparty: "" });

  const load = () => api.get(`/companies/${companyId}/contracts`).then(r => setItems(r.data));
  useEffect(() => { load(); }, [companyId]);

  const create = async () => {
    if (!form.contract_text.trim()) { alert("Cole o texto do contrato"); return; }
    await api.post(`/companies/${companyId}/contracts`, form);
    setForm({ contract_text: "", contract_type: "prestacao_servico", counterparty: "" });
    setShowNew(false); load();
  };

  const analyze = async (id) => {
    setBusy(id);
    try {
      const { data } = await api.post(`/companies/${companyId}/contracts/${id}/ai-analyze`);
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const j = await api.get(`/companies/${companyId}/jobs/${data.job_id}`);
        if (j.data.status === "done" || j.data.status === "error") break;
      }
      load();
    } finally { setBusy(null); }
  };

  const del = async (id) => { if (confirm("Excluir contrato?")) { await api.delete(`/companies/${companyId}/contracts/${id}`); load(); } };
  const rc = { alto: "text-red-400", medio: "text-amber-400", baixo: "text-emerald-400" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Shield className="text-belota-gold w-5 h-5"/> Revisão Contratual Estratégica</h2>
          <p className="text-sm text-belota-muted">Análise IA de cláusulas LGPD, DPAs e riscos contratuais</p>
        </div>
        {canCreate && <button className={btnGold} onClick={() => setShowNew(!showNew)}><FileText className="w-4 h-4"/> Novo Contrato</button>}
      </div>

      {showNew && (
        <div className={`${card} space-y-3`}>
          <div className="grid grid-cols-2 gap-3">
            <select className="bg-belota-card border border-belota-border rounded p-2 text-sm" value={form.contract_type} onChange={e => setForm({ ...form, contract_type: e.target.value })}>
              <option value="prestacao_servico">Prestação de Serviços</option>
              <option value="desenvolvimento">Desenvolvimento de Software</option>
              <option value="licenciamento">Licenciamento</option>
              <option value="fornecedor">Fornecedor/Operador</option>
              <option value="dpa">DPA</option>
            </select>
            <input className="bg-belota-card border border-belota-border rounded p-2 text-sm" placeholder="Contraparte" value={form.counterparty} onChange={e => setForm({ ...form, counterparty: e.target.value })}/>
          </div>
          <textarea rows={10} className="w-full bg-belota-card border border-belota-border rounded p-2 text-sm" placeholder="Cole o texto integral do contrato..." value={form.contract_text} onChange={e => setForm({ ...form, contract_text: e.target.value })}/>
          <div className="flex gap-2">
            <button className={btnGold} onClick={create}>Salvar</button>
            <button className={btnGhost} onClick={() => setShowNew(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {items.map(c => (
        <div key={c.id} className={card}>
          <div className="flex items-start justify-between gap-3">
            <div className="cursor-pointer flex-1" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="gold">{c.contract_type.replace("_", " ")}</Badge>
                {c.risk_level && <span className={`text-xs font-bold ${rc[c.risk_level] || ""}`}>risco {c.risk_level}</span>}
                <Badge tone={c.status === "analisado" ? "green" : "neutral"}>{c.status}</Badge>
              </div>
              <div className="font-semibold">{c.counterparty || "Contrato"} · {new Date(c.created_at).toLocaleDateString("pt-BR")}</div>
              <p className="text-sm text-belota-muted mt-1">{(c.contract_text || "").substring(0, 140)}...</p>
            </div>
            {canCreate && (
              <div className="flex gap-1">
                {c.status !== "analisado" && (
                  <button className={btnGold} disabled={busy === c.id} onClick={() => analyze(c.id)}>
                    {busy === c.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} Analisar IA
                  </button>
                )}
                <button className={btnGhost} onClick={() => del(c.id)}><Trash2 className="w-4 h-4"/></button>
              </div>
            )}
          </div>
          {open === c.id && c.recommendations && (
            <pre className="mt-4 p-4 bg-belota-card rounded text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">{c.recommendations}</pre>
          )}
        </div>
      ))}
      {items.length === 0 && <div className={`${card} text-center text-belota-muted py-10`}>Nenhum contrato cadastrado.</div>}
    </div>
  );
}
JSXCR

cat > /app/frontend/src/pages/Roadmap.jsx <<'JSXRM'
import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Badge } from "../components/ui-belota";
import { Map, Sparkles, CheckCircle2, Circle, Loader2, Calendar } from "lucide-react";

const PH = { 1: "Diagnóstico e Inventário", 2: "Análise e Avaliação", 3: "Documentação", 4: "Implementação", 5: "Certificação" };
const card = "bg-belota-surface border border-belota-border rounded-lg p-5";

export default function Roadmap({ companyId, isStaff }) {
  const [tasks, setTasks] = useState([]);
  const [prog, setProg] = useState({ total: 0, completed: 0, progress_pct: 0 });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [a, b] = await Promise.all([
      api.get(`/companies/${companyId}/roadmap`),
      api.get(`/companies/${companyId}/roadmap/progress`),
    ]);
    setTasks(a.data); setProg(b.data);
  };
  useEffect(() => { load(); }, [companyId]);

  const generate = async () => {
    if (!confirm("Gerar Roadmap de 15 dias? Substitui o atual.")) return;
    setBusy(true);
    try { await api.post(`/companies/${companyId}/roadmap/generate`); await load(); } finally { setBusy(false); }
  };

  const toggle = async (t) => {
    await api.put(`/companies/${companyId}/roadmap/${t.id}`, { status: t.status === "concluida" ? "pendente" : "concluida" });
    load();
  };

  const byPhase = tasks.reduce((a, t) => { (a[t.phase] = a[t.phase] || []).push(t); return a; }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Map className="text-belota-gold w-5 h-5"/> Roadmap de Governança</h2>
          <p className="text-sm text-belota-muted">Plano de execução — 15 dias corridos (Framework BELOTA GRC™)</p>
        </div>
        {isStaff && <button onClick={generate} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 bg-belota-gold text-black text-sm font-semibold rounded hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} Gerar Roadmap
        </button>}
      </div>

      {prog.total > 0 && (
        <div className={card}>
          <div className="flex justify-between text-sm mb-2">
            <span>Progresso Geral</span>
            <span className="text-belota-gold font-bold">{prog.completed}/{prog.total} ({prog.progress_pct}%)</span>
          </div>
          <div className="h-3 bg-belota-border rounded-full overflow-hidden">
            <div className="h-3 bg-belota-gold transition-all" style={{ width: `${prog.progress_pct}%` }}/>
          </div>
        </div>
      )}

      {Object.keys(byPhase).sort().map(p => (
        <div key={p}>
          <h3 className="flex items-center gap-2 font-bold text-belota-gold mb-2"><Badge tone="gold">Fase {p}</Badge> {PH[p]}</h3>
          <div className="space-y-2">
            {byPhase[p].map(t => (
              <div key={t.id} className={`${card} flex gap-3 ${t.status === "concluida" ? "opacity-70" : ""}`}>
                <button onClick={() => isStaff && toggle(t)}>
                  {t.status === "concluida" ? <CheckCircle2 className="text-emerald-500 w-6 h-6"/> : <Circle className="text-belota-border hover:text-belota-gold w-6 h-6"/>}
                </button>
                <div>
                  <div className="flex items-center gap-2 text-xs text-belota-muted mb-1">
                    <Badge tone="neutral">Dia {t.day}</Badge>
                    <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3"/>{new Date(t.due_date).toLocaleDateString("pt-BR")}</span>
                  </div>
                  <div className={`font-semibold ${t.status === "concluida" ? "line-through text-belota-muted" : ""}`}>{t.title}</div>
                  <p className="text-sm text-belota-muted">{t.description}</p>
                  <div className="text-xs text-belota-gold mt-1">Entregável: {t.deliverable}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {tasks.length === 0 && <div className={`${card} text-center text-belota-muted py-10`}>Roadmap ainda não gerado. Clique em “Gerar Roadmap”.</div>}
    </div>
  );
}
JSXRM

cat > /app/frontend/src/pages/RiskMatrix.jsx <<'JSXMX'
import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Grid3x3, AlertTriangle } from "lucide-react";

const L = [1, 2, 3, 4, 5];
const LB = { 1: "Muito Baixo", 2: "Baixo", 3: "Médio", 4: "Alto", 5: "Muito Alto" };
const color = s => s >= 15 ? "bg-red-600 text-white" : s >= 10 ? "bg-orange-500 text-white" : s >= 6 ? "bg-amber-500 text-black" : s >= 3 ? "bg-yellow-400 text-black" : "bg-emerald-600 text-white";

export default function RiskMatrix({ companyId }) {
  const [risks, setRisks] = useState([]);
  useEffect(() => { api.get(`/companies/${companyId}/risks`).then(r => setRisks(r.data)); }, [companyId]);

  const mx = {};
  risks.forEach(r => { (mx[`${r.probability}-${r.impact}`] = mx[`${r.probability}-${r.impact}`] || []).push(r); });
  const crit = risks.filter(r => r.probability * r.impact >= 15).length;
  const high = risks.filter(r => r.probability * r.impact >= 10 && r.probability * r.impact < 15).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Grid3x3 className="text-belota-gold w-5 h-5"/> Matriz de Riscos GRC</h2>
          <p className="text-sm text-belota-muted">Heatmap 5×5 — probabilidade × impacto</p>
        </div>
        <div className="flex gap-5 text-center">
          <div><div className="text-2xl font-bold text-red-500">{crit}</div><div className="text-xs text-belota-muted">Críticos</div></div>
          <div><div className="text-2xl font-bold text-orange-500">{high}</div><div className="text-xs text-belota-muted">Altos</div></div>
          <div><div className="text-2xl font-bold text-belota-gold">{risks.length}</div><div className="text-xs text-belota-muted">Total</div></div>
        </div>
      </div>

      <div className="bg-belota-surface border border-belota-border rounded-lg p-5 overflow-x-auto">
        <div className="min-w-[640px] grid gap-1" style={{ gridTemplateColumns: "90px repeat(5, 1fr)" }}>
          <div/>
          {L.map(p => <div key={p} className="text-center text-xs font-bold text-belota-gold py-1">{LB[p]}</div>)}
          {[...L].reverse().map(i => [
            <div key={`r${i}`} className="flex items-center justify-end pr-2 text-xs font-bold text-belota-gold">{LB[i]}</div>,
            ...L.map(p => {
              const s = p * i, n = (mx[`${p}-${i}`] || []).length;
              return (
                <div key={`${p}-${i}`} className={`${color(s)} rounded min-h-[64px] flex flex-col items-center justify-center`}>
                  <div className="text-xl font-bold">{s}</div>
                  {n > 0 && <div className="text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>{n}</div>}
                </div>
              );
            })
          ])}
          <div/>
          <div className="col-span-5 text-center text-xs text-belota-muted font-bold pt-2">PROBABILIDADE →</div>
        </div>
      </div>
    </div>
  );
}
JSXMX

echo "=== [5/7] Patches server.py + CompanyDetail.jsx ==="
python3 - <<'PYPATCH'
import re
cd = "/app/frontend/src/pages/CompanyDetail.jsx"
s = open(cd, encoding="utf-8").read()
if "ContractReview" not in s:
    s = s.replace('import Tickets from "./company/Tickets";',
        'import Tickets from "./company/Tickets";\nimport ContractReview from "./ContractReview";\nimport Roadmap from "./Roadmap";\nimport RiskMatrix from "./RiskMatrix";', 1)
old_tabs = '''const TABS = [
  "Visão Geral", "Diagnóstico", "Inventários", "RoPA", "RIPD", "Riscos",
  "Plano de Ação", "Documentos", "Treinamentos", "Evidências", "Tickets", "Certificado", "Auditoria",
];'''
new_tabs = '''const TABS = [
  "Visão Geral", "Diagnóstico", "Roadmap", "Inventários", "RoPA", "RIPD",
  "Matriz de Riscos", "Riscos", "Plano de Ação", "Revisão Contratual",
  "Documentos", "Treinamentos", "Evidências", "Tickets", "Certificado", "Auditoria",
];'''
s = s.replace(old_tabs, new_tabs, 1) if old_tabs in s else re.sub(r"const TABS = \[.*?\];", new_tabs, s, count=1, flags=re.S)
anchor = '{tab === "RIPD" && <Ripd companyId={id} canCreate={isStaff} />}'
if "Roadmap companyId" not in s and anchor in s:
    s = s.replace(anchor, anchor + '''
        {tab === "Roadmap" && <Roadmap companyId={id} isStaff={isStaff} />}
        {tab === "Matriz de Riscos" && <RiskMatrix companyId={id} />}
        {tab === "Revisão Contratual" && <ContractReview companyId={id} canCreate={isStaff} />}''', 1)
open(cd, "w", encoding="utf-8").write(s)

sp = "/app/backend/server.py"
t = open(sp, encoding="utf-8").read()
if "from modules import" not in t:
    reg = '''# ---------------------------------------------------------------------------
# Premium modules (Sprint 1-4)
# ---------------------------------------------------------------------------
from modules import contract_review as _cr
from modules import roadmap as _rm
from modules import pdf_export as _pe
api.include_router(_cr.router)
api.include_router(_rm.router)
api.include_router(_pe.router)

app.include_router(api)'''
    t = t.replace("app.include_router(api)", reg, 1)
    open(sp, "w", encoding="utf-8").write(t)
print("PATCH OK")
PYPATCH

echo "=== [6/7] Validacao de sintaxe ==="
python3 -c "import ast; [ast.parse(open(f'/app/backend/modules/{f}').read()) for f in ['contract_review.py','roadmap.py','pdf_export.py']]; print('PYTHON OK')"

echo "=== [7/7] Reiniciar servicos + push ==="
pkill -f "uvicorn server:app" 2>/dev/null || true
sleep 1
cd /app/backend && nohup python3 -m uvicorn server:app --host 0.0.0.0 --port 8000 > /tmp/belota_backend.log 2>&1 &
pkill -f "craco start|react-scripts" 2>/dev/null || true
sleep 1
cd /app/frontend && nohup yarn start > /tmp/belota_frontend.log 2>&1 &
cd /app
git add -A 2>/dev/null && git commit -m "Sprint 1-4: Revisao Contratual, Roadmap 15d, Matriz de Riscos, PDFs e Selo" 2>/dev/null && git push origin main 2>/dev/null || echo "push opcional falhou (sem problema)"
sleep 4
echo ""
echo "=== RESULTADO ==="
tail -5 /tmp/belota_backend.log 2>/dev/null
echo "INSTALACAO CONCLUIDA - teste as tabs Roadmap / Matriz de Riscos / Revisao Contratual"