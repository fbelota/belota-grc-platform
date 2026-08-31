"""Sprint 5 - DPO as a Service + Licitation Engine + Riscos IA"""
import io, re, json
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from server import (db, now_iso, new_id, log_event, ai_generate,
                    create_job, run_job, get_current_user, require_staff,
                    get_company_or_403)

router = APIRouter()

def extract_text(data: bytes, filename: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(data))
        return "\n".join((p.extract_text() or "") for p in reader.pages)
    if name.endswith(".docx"):
        import docx
        d = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in d.paragraphs)
    if name.endswith((".txt", ".md")):
        return data.decode("utf-8", errors="replace")
    raise HTTPException(400, "Formato nao suportado. Envie PDF, DOCX ou TXT.")

def parse_json_loose(text: str):
    try:
        return json.loads(text)
    except Exception:
        for pat in (r"\{.*\}", r"\[.*\]"):
            m = re.search(pat, text, re.S)
            if m:
                try:
                    return json.loads(m.group(0))
                except Exception:
                    pass
    return None

def render_pdf(html: str):
    from xhtml2pdf import pisa
    from fastapi.responses import StreamingResponse
    buf = io.BytesIO()
    st = pisa.CreatePDF(io.StringIO(html), dest=buf)
    if st.err:
        raise HTTPException(500, "Erro ao gerar PDF")
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf")

# ================= LICITATION ENGINE =================
class LicitacaoIn(BaseModel):
    edital_text: str
    orgao: str = ""
    modalidade: str = "pregao"
    numero: str = ""
    deadline: Optional[str] = None

def _lic_doc(company_id, body_dict, source, file_name=None):
    return {"id": new_id(), "company_id": company_id, **body_dict,
            "source": source, "file_name": file_name, "status": "em_analise",
            "eligibility": None, "recommendations": None,
            "created_at": now_iso(), "updated_at": now_iso()}

@router.post("/companies/{company_id}/licitations")
async def create_licit(company_id: str, body: LicitacaoIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    doc = _lic_doc(company_id, body.model_dump(), "manual")
    await db.licitations.insert_one(doc)
    await log_event(company_id, user, "criou", "licitacao", body.numero or body.orgao)
    doc.pop("_id", None)
    return doc

@router.post("/companies/{company_id}/licitations/upload")
async def upload_licit(company_id: str, file: UploadFile = File(...),
                       orgao: str = Form(""), modalidade: str = Form("pregao"),
                       numero: str = Form(""), deadline: Optional[str] = Form(None),
                       user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(400, "Arquivo acima de 15MB")
    text = extract_text(data, file.filename)
    if not text.strip():
        raise HTTPException(400, "Sem texto extraivel (PDF escaneado?). Cole o texto manualmente.")
    doc = _lic_doc(company_id, {"edital_text": text[:200000], "orgao": orgao,
                   "modalidade": modalidade, "numero": numero, "deadline": deadline},
                   "upload", file.filename)
    await db.licitations.insert_one(doc)
    await log_event(company_id, user, "upload", "licitacao", file.filename or "")
    doc.pop("_id", None)
    return doc

@router.get("/companies/{company_id}/licitations")
async def list_licit(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await db.licitations.find({"company_id": company_id}, {"_id": 0}).sort("created_at", -1).to_list(200)

@router.delete("/companies/{company_id}/licitations/{item_id}")
async def delete_licit(company_id: str, item_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.licitations.delete_one({"id": item_id, "company_id": company_id})
    return {"ok": True}

@router.post("/companies/{company_id}/licitations/{item_id}/ai-analyze")
async def analyze_licit(company_id: str, item_id: str, user: dict = Depends(require_staff)):
    company = await get_company_or_403(user, company_id)
    lic = await db.licitations.find_one({"id": item_id, "company_id": company_id}, {"_id": 0})
    if not lic:
        raise HTTPException(404, "Edital nao encontrado")
    cert = await db.certificates.find_one({"company_id": company_id}, {"_id": 0})
    evids = await db.evidences.find({"company_id": company_id}, {"_id": 0}).to_list(20)
    docs = await db.documents.find({"company_id": company_id}, {"_id": 0}).to_list(30)
    job_id = await create_job(company_id, "licitation_analyze")

    async def worker():
        prompt = (
            f"Voce e o time BELOTA GRC preparando a empresa {company['name']} "
            f"(score de conformidade {company.get('compliance_score', 0)}%, "
            f"{'COM selo BELOTA GRC VERIFIED' if cert else 'SEM selo ainda'}). "
            f"Evidencias disponiveis: {', '.join(e.get('title','') for e in evids) or 'nenhuma'}. "
            f"Documentos prontos: {', '.join(d.get('title','') for d in docs) or 'nenhum'}. "
            f"Analise o EDITAL abaixo e retorne JSON valido com: eligibility (apta|apta_com_restricoes|inapta), "
            f"lgpd_requirements (lista), required_evidence (lista), gaps (lista do que falta diante das evidencias atuais), "
            f"risks (lista), recommendations (texto). EDITAL:\n{lic['edital_text'][:120000]}")
        text = await ai_generate("Voce e especialista em licitacoes publicas (Lei 14.133/2021) e LGPD. Responda apenas JSON valido.", prompt)
        parsed = parse_json_loose(text)
        await db.licitations.update_one({"id": item_id}, {"$set": {
            "status": "analisado",
            "eligibility": (parsed or {}).get("eligibility"),
            "recommendations": json.dumps(parsed, ensure_ascii=False, indent=2) if parsed else text,
            "updated_at": now_iso()}})
        await log_event(company_id, user, "analisou", "licitacao", lic.get("numero", ""))
        return {"analysis": text}

    run_job(job_id, worker)
    return {"job_id": job_id}

# ================= RISCOS IA =================
@router.post("/companies/{company_id}/risks/ai-generate")
async def risks_ai_generate(company_id: str, user: dict = Depends(require_staff)):
    company = await get_company_or_403(user, company_id)
    diag = await db.diagnostics.find_one({"company_id": company_id}, {"_id": 0})
    job_id = await create_job(company_id, "risks_generate")

    async def worker():
        prompt = (
            f"Empresa {company['name']} (setor {company.get('sector','N/A')}, score {company.get('compliance_score',0)}%). "
            f"Diagnostico por dominio: {diag.get('domain_scores') if diag else 'nao realizado'}. "
            f"Com base nas lacunas, gere JSON array com 6 a 10 riscos GRC, cada um com: "
            f"title, category (governanca|lgpd|seguranca|operacional|contratual), description, "
            f"probability (1-5), impact (1-5), treatment_plan.")
        text = await ai_generate("Voce e um CRO senior. Responda apenas JSON array valido.", prompt)
        risks = parse_json_loose(text)
        if not isinstance(risks, list):
            raise RuntimeError("IA nao retornou lista de riscos")
        n_risks, n_actions = 0, 0
        for r in risks[:12]:
            prob = int(min(max(r.get("probability", 3), 1), 5))
            imp = int(min(max(r.get("impact", 3), 1), 5))
            await db.risks.insert_one({"id": new_id(), "company_id": company_id,
                "title": r.get("title", "Risco"), "category": r.get("category", "operacional"),
                "description": r.get("description", ""), "probability": prob, "impact": imp,
                "score": prob * imp, "treatment": "mitigar",
                "treatment_plan": r.get("treatment_plan", ""), "status": "aberto",
                "owner": "", "created_at": now_iso(), "updated_at": now_iso()})
            n_risks += 1
            if prob * imp >= 10:
                await db.actions.insert_one({"id": new_id(), "company_id": company_id,
                    "title": "Tratar: " + r.get("title", "Risco"),
                    "description": r.get("treatment_plan", ""), "owner": "",
                    "priority": "alta", "due_date": None, "status": "pendente",
                    "module": "risco", "created_at": now_iso(), "updated_at": now_iso()})
                n_actions += 1
        count = await db.risks.count_documents({"company_id": company_id})
        await db.companies.update_one({"id": company_id}, {"$set": {"risk_count": count}})
        await log_event(company_id, user, "gerou", "riscos-ia", f"{n_risks} riscos")
        return {"risks": n_risks, "actions": n_actions}

    run_job(job_id, worker)
    return {"job_id": job_id}

# ================= DPO AS A SERVICE =================
DPO_MONTHLY = [
    ("Revisao de evidencias TCE/ANPD", "Conferencia e atualizacao do pacote de evidencias para orgaos de controle", "evidencias"),
    ("Atendimento a titulares", "Revisao de tickets e SLAs de pedidos dos titulares no periodo", "titulares"),
    ("Monitoramento contratual", "Revisao de contratos ativos, DPAs e clausulas de protecao de dados", "contratos"),
    ("Vigilia de editais", "Apoio a licitacoes: analise de clausulas de LGPD e integridade em novos editais", "licitacoes"),
    ("Atualizacao de inventarios e RoPA", "Verificacao de mudancas em sistemas, processos e tratamentos de dados", "lgpd"),
    ("Relatorio executivo mensal", "Fechamento do ciclo com relatorio Audit Ready para a direcao", "governanca"),
]

@router.post("/companies/{company_id}/dpo/plan/generate")
async def dpo_generate(company_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.dpo_plans.delete_many({"company_id": company_id})
    base = datetime.now(timezone.utc)
    tasks = []
    for month in range(1, 13):
        for idx, (title, desc, cat) in enumerate(DPO_MONTHLY):
            tasks.append({"id": new_id(), "company_id": company_id, "month": month,
                "title": title, "description": desc, "category": cat,
                "due_date": (base + timedelta(days=30 * month)).isoformat(),
                "status": "pendente", "created_at": now_iso(), "updated_at": now_iso()})
    await db.dpo_plans.insert_many(tasks)
    await log_event(company_id, user, "gerou", "dpo-plan", "12 meses")
    return {"ok": True, "task_count": len(tasks)}

@router.get("/companies/{company_id}/dpo/plan")
async def dpo_plan(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await db.dpo_plans.find({"company_id": company_id}, {"_id": 0}).sort("month", 1).to_list(200)

@router.put("/companies/{company_id}/dpo/plan/{task_id}")
async def dpo_update(company_id: str, task_id: str, body: dict, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    upd = {k: v for k, v in body.items() if v is not None}
    upd["updated_at"] = now_iso()
    if upd.get("status") == "concluida":
        upd["completed_at"] = now_iso()
    await db.dpo_plans.update_one({"id": task_id, "company_id": company_id}, {"$set": upd})
    return await db.dpo_plans.find_one({"id": task_id}, {"_id": 0})

@router.get("/companies/{company_id}/dpo/progress")
async def dpo_progress(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    tasks = await db.dpo_plans.find({"company_id": company_id}).to_list(200)
    done = len([t for t in tasks if t.get("status") == "concluida"])
    return {"total": len(tasks), "completed": done,
            "progress_pct": round(done / len(tasks) * 100) if tasks else 0}

@router.post("/companies/{company_id}/dpo/report/generate")
async def dpo_report(company_id: str, user: dict = Depends(require_staff)):
    company = await get_company_or_403(user, company_id)
    job_id = await create_job(company_id, "dpo_report")

    async def worker():
        risks = await db.risks.find({"company_id": company_id}).to_list(200)
        actions = await db.actions.find({"company_id": company_id}).to_list(200)
        tickets = await db.tickets.find({"company_id": company_id}).to_list(200)
        evids = await db.evidences.count_documents({"company_id": company_id})
        lics = await db.licitations.count_documents({"company_id": company_id})
        diag = await db.diagnostics.find_one({"company_id": company_id}, {"_id": 0})
        metrics = {
            "score": company.get("compliance_score", 0),
            "riscos_abertos": len([r for r in risks if r.get("status") != "fechado"]),
            "riscos_criticos": len([r for r in risks if r.get("score", 0) >= 15]),
            "acoes_concluidas": len([a for a in actions if a.get("status") == "concluida"]),
            "acoes_totais": len(actions),
            "tickets_abertos": len([t for t in tickets if t.get("status") == "aberto"]),
            "evidencias": evids, "licitacoes_apoiadas": lics,
            "dominios": diag.get("domain_scores") if diag else [],
        }
        prompt = (f"Voce e o DPO encarregado da empresa {company['name']}. "
                  f"Metricas do mes: {metrics}. Escreva o RELATORIO EXECUTIVO MENSAL 'Audit Ready' "
                  f"em Markdown, com secoes: 1) Sumario executivo, 2) Indicadores de conformidade, "
                  f"3) Atividades do DPO no periodo, 4) Riscos e recomendacoes, "
                  f"5) Posicao regulatoria (ANPD/TCE/MPC), 6) Plano do proximo mes. "
                  f"Tom formal, pronto para apresentacao a diretoria e orgaos de controle.")
        content = await ai_generate("Voce e DPO senior da BELOTA GRC. Escreva em portugues formal.", prompt)
        now = datetime.now(timezone.utc)
        doc = {"id": new_id(), "company_id": company_id,
               "title": f"Relatorio Audit Ready - {now.strftime('%m/%Y')}",
               "period": now.strftime("%m/%Y"), "content": content,
               "created_at": now_iso()}
        await db.dpo_reports.insert_one(doc)
        await log_event(company_id, user, "gerou", "dpo-report", doc["title"])
        return doc

    run_job(job_id, worker)
    return {"job_id": job_id}

@router.get("/companies/{company_id}/dpo/reports")
async def dpo_reports(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await db.dpo_reports.find({"company_id": company_id}, {"_id": 0}).sort("created_at", -1).to_list(50)

@router.get("/companies/{company_id}/dpo/reports/{report_id}/pdf")
async def dpo_report_pdf(company_id: str, report_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    rep = await db.dpo_reports.find_one({"id": report_id, "company_id": company_id}, {"_id": 0})
    if not rep:
        raise HTTPException(404, "Relatorio nao encontrado")
    import markdown
    body = markdown.markdown(rep.get("content", ""))
    html = f"""<html><head><meta charset="UTF-8"/><style>
    @page {{size: A4; margin: 2.5cm;}}
    body {{font-family: Helvetica; color: #222; line-height: 1.6;}}
    .h {{border-bottom: 3px solid #C9A227; padding-bottom: 12px; margin-bottom: 25px;}}
    .logo {{color: #C9A227; font-size: 20px; font-weight: bold; letter-spacing: 3px;}}
    h1 {{color: #111;}} h2 {{color: #C9A227;}}
    </style></head><body>
    <div class="h"><div class="logo">BELOTA GRC</div>
    <div style="color:#666;font-size:9px;letter-spacing:2px">DPO AS A SERVICE - RELATORIO AUDIT READY</div></div>
    <h1>{rep['title']}</h1>{body}
    </body></html>"""
    return render_pdf(html)