"""Revisao Contratual Estrategica - com upload de arquivos"""
import io
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
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

def _base_doc(company_id, contract_type, counterparty, text, source, file_name=None):
    return {"id": new_id(), "company_id": company_id, "contract_text": text[:200000],
            "contract_type": contract_type, "counterparty": counterparty,
            "value": None, "notes": "", "source": source, "file_name": file_name,
            "status": "em_revisao", "risk_level": None, "recommendations": None,
            "created_at": now_iso(), "updated_at": now_iso()}

@router.post("/companies/{company_id}/contracts")
async def create_contract(company_id: str, body: ContractReviewIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    doc = _base_doc(company_id, body.contract_type, body.counterparty, body.contract_text, "manual")
    await db.contract_reviews.insert_one(doc)
    await log_event(company_id, user, "criou", "contrato", body.counterparty or body.contract_type)
    doc.pop("_id", None)
    return doc

@router.post("/companies/{company_id}/contracts/upload")
async def upload_contract(company_id: str, file: UploadFile = File(...),
                          contract_type: str = Form("prestacao_servico"),
                          counterparty: str = Form(""),
                          user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(400, "Arquivo acima de 15MB")
    name = (file.filename or "").lower()
    text = ""
    if name.endswith(".pdf"):
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(data))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
    elif name.endswith(".docx"):
        import docx
        d = docx.Document(io.BytesIO(data))
        text = "\n".join(p.text for p in d.paragraphs)
    elif name.endswith((".txt", ".md")):
        text = data.decode("utf-8", errors="replace")
    else:
        raise HTTPException(400, "Formato nao suportado. Envie PDF, DOCX ou TXT.")
    if not text.strip():
        raise HTTPException(400, "Sem texto extraivel (PDF escaneado/imagem?). Cole o texto manualmente.")
    doc = _base_doc(company_id, contract_type, counterparty, text, "upload", file.filename)
    await db.contract_reviews.insert_one(doc)
    await log_event(company_id, user, "upload", "contrato", file.filename or "")
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
        origem = f" (arquivo: {contract['file_name']})" if contract.get("file_name") else ""
        prompt = (f"Empresa {company['name']}. Analise o contrato abaixo{origem} sob a otica LGPD/compliance. "
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
