from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import asyncio
import logging
import bcrypt
import jwt
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    _HAS_EMERGENT_LLM = True
except Exception:
    _HAS_EMERGENT_LLM = False
    from ai_provider import ai_generate as _portable_ai_generate
import io
import httpx
import markdown as md
from xhtml2pdf import pisa
from fastapi.responses import StreamingResponse, FileResponse

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI(title="BELOTA GRC Platform API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("belota")

ROLES = ["admin", "consultor", "dpo", "cliente"]
STAFF_ROLES = ["admin", "consultor", "dpo"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    jwt_token = request.cookies.get("access_token")
    session_token = request.cookies.get("session_token")
    auth = request.headers.get("Authorization", "")
    bearer = auth[7:] if auth.startswith("Bearer ") else None

    # 1) JWT (email/password) auth
    for t in [jwt_token, bearer]:
        if not t:
            continue
        try:
            payload = jwt.decode(t, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") == "access":
                user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
                if user:
                    return user
        except jwt.InvalidTokenError:
            pass

    # 2) Emergent Google session token
    for t in [session_token, bearer]:
        if not t:
            continue
        session = await db.user_sessions.find_one({"session_token": t})
        if not session:
            continue
        exp = session["expires_at"]
        if isinstance(exp, str):
            exp = datetime.fromisoformat(exp)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp > datetime.now(timezone.utc):
            user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0, "password_hash": 0})
            if user:
                return user

    raise HTTPException(status_code=401, detail="Não autenticado")


def require_staff(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Acesso restrito à equipe BELOTA")
    return user


async def user_can_access_company(user: dict, company_id: str) -> bool:
    if user["role"] in STAFF_ROLES:
        return True
    return user.get("company_id") == company_id


async def get_company_or_403(user: dict, company_id: str) -> dict:
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    if not await user_can_access_company(user, company_id):
        raise HTTPException(status_code=403, detail="Sem acesso a esta empresa")
    return company


async def log_event(company_id: Optional[str], user: dict, action: str, entity: str, detail: str = ""):
    await db.events.insert_one({
        "id": new_id(), "company_id": company_id, "user_id": user.get("id"),
        "user_name": user.get("name"), "action": action, "entity": entity,
        "detail": detail, "created_at": now_iso(),
    })


# ---------------------------------------------------------------------------
# AI helper
# ---------------------------------------------------------------------------
async def ai_generate(system_message: str, prompt: str) -> str:
    if _HAS_EMERGENT_LLM and EMERGENT_LLM_KEY:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=new_id(),
                       system_message=system_message).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=prompt))
        return resp if isinstance(resp, str) else str(resp)
    return await _portable_ai_generate(system_message, prompt)


# ---------------------------------------------------------------------------
# Background AI job infrastructure (avoids ingress timeouts on long generations)
# ---------------------------------------------------------------------------
async def create_job(company_id: str, kind: str) -> str:
    job_id = new_id()
    await db.ai_jobs.insert_one({
        "id": job_id, "company_id": company_id, "kind": kind,
        "status": "processing", "result": None, "error": None,
        "created_at": now_iso()})
    return job_id


def run_job(job_id: str, worker):
    async def _run():
        try:
            result = await worker()
            await db.ai_jobs.update_one({"id": job_id},
                {"$set": {"status": "done", "result": result, "finished_at": now_iso()}})
        except Exception as e:  # noqa
            logger.exception("AI job failed")
            await db.ai_jobs.update_one({"id": job_id},
                {"$set": {"status": "error", "error": str(e)}})
    asyncio.create_task(_run())


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal["consultor", "dpo", "cliente"] = "consultor"
    company_id: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class CompanyIn(BaseModel):
    name: str
    cnpj: Optional[str] = ""
    sector: Optional[str] = ""
    size: Optional[str] = ""
    contact_name: Optional[str] = ""
    contact_email: Optional[str] = ""
    contact_phone: Optional[str] = ""
    stage: str = "lead"
    plan: Optional[str] = "premium"
    notes: Optional[str] = ""


class InventoryIn(BaseModel):
    type: Literal["data", "systems", "assets", "vendors"]
    name: str
    category: Optional[str] = ""
    description: Optional[str] = ""
    sensitivity: Optional[str] = "normal"
    owner: Optional[str] = ""
    location: Optional[str] = ""
    extra: Optional[dict] = {}


class RopaIn(BaseModel):
    process_name: str
    purpose: str = ""
    legal_basis: str = ""
    data_categories: str = ""
    data_subjects: str = ""
    retention: str = ""
    recipients: str = ""
    international_transfer: bool = False
    security_measures: str = ""


class RipdIn(BaseModel):
    title: str
    scope: str = ""
    content: str = ""
    risk_level: str = "medium"


class RiskIn(BaseModel):
    title: str
    category: str = ""
    description: str = ""
    probability: int = 3
    impact: int = 3
    treatment: str = "mitigar"
    treatment_plan: str = ""
    status: str = "aberto"
    owner: str = ""


class ActionIn(BaseModel):
    title: str
    description: str = ""
    owner: str = ""
    priority: str = "media"
    due_date: Optional[str] = None
    status: str = "pendente"
    module: str = ""


class DocGenIn(BaseModel):
    doc_type: str
    title: Optional[str] = None
    instructions: Optional[str] = ""


class DocUpdateIn(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None


class TrainingIn(BaseModel):
    title: str
    audience: str = ""
    description: str = ""
    status: str = "planejado"
    completion: int = 0


class EvidenceIn(BaseModel):
    title: str
    module: str = ""
    description: str = ""
    reference: str = ""


class TicketIn(BaseModel):
    requester_name: str
    requester_email: str = ""
    request_type: str = "acesso"
    description: str = ""


class TicketUpdateIn(BaseModel):
    status: Optional[str] = None
    resolution: Optional[str] = None


class DiagnosticIn(BaseModel):
    answers: dict  # {question_id: "sim"|"parcial"|"nao"}


class LicitacaoIn(BaseModel):
    edital: str
    orgao: str = ""
    modalidade: str = "pregao"
    numero: str = ""
    deadline: Optional[str] = None
    status: str = "em_preparacao"
    notes: str = ""
    checklist: Optional[List[dict]] = None


# ---------------------------------------------------------------------------
# Static data: adaptive diagnostic questionnaire & document catalog
# ---------------------------------------------------------------------------
DIAGNOSTIC = [
    {"domain": "Governança", "questions": [
        {"id": "gov1", "text": "A empresa possui um Encarregado (DPO) formalmente designado?"},
        {"id": "gov2", "text": "Existe um comitê ou responsável por privacidade e proteção de dados?"},
        {"id": "gov3", "text": "Há políticas internas de privacidade e segurança aprovadas?"},
    ]},
    {"domain": "Mapeamento de Dados", "questions": [
        {"id": "map1", "text": "Os processos que tratam dados pessoais estão mapeados?"},
        {"id": "map2", "text": "Existe inventário de dados pessoais (RoPA) atualizado?"},
        {"id": "map3", "text": "As bases legais para cada tratamento estão documentadas?"},
    ]},
    {"domain": "Segurança da Informação", "questions": [
        {"id": "sec1", "text": "Existem controles de acesso e autenticação implementados?"},
        {"id": "sec2", "text": "Os dados sensíveis são criptografados em repouso e trânsito?"},
        {"id": "sec3", "text": "Há plano de resposta a incidentes de segurança?"},
    ]},
    {"domain": "Direitos dos Titulares", "questions": [
        {"id": "tit1", "text": "Existe canal para atendimento de solicitações dos titulares?"},
        {"id": "tit2", "text": "Há procedimento para responder pedidos dentro do prazo legal?"},
    ]},
    {"domain": "Fornecedores e Contratos", "questions": [
        {"id": "for1", "text": "Os contratos com operadores possuem cláusulas de proteção de dados (DPA)?"},
        {"id": "for2", "text": "Fornecedores críticos passam por avaliação de conformidade?"},
    ]},
    {"domain": "Continuidade e Incidentes", "questions": [
        {"id": "con1", "text": "Existe plano de backup e continuidade de negócios?"},
        {"id": "con2", "text": "Há registro e tratamento formal de incidentes de dados?"},
    ]},
]

SCORE_WEIGHT = {"sim": 1.0, "parcial": 0.5, "nao": 0.0}

DOC_CATALOG = {
    "politica_privacidade": "Política de Privacidade",
    "politica_seguranca": "Política de Segurança da Informação",
    "codigo_etica": "Código de Ética",
    "codigo_conduta": "Código de Conduta",
    "plano_resposta_incidentes": "Plano de Resposta a Incidentes",
    "plano_backup": "Plano de Backup",
    "plano_continuidade": "Plano de Continuidade de Negócios",
    "plano_diretor": "Plano Diretor de Governança",
    "dpa": "Contrato de Tratamento de Dados (DPA)",
    "nda": "Acordo de Confidencialidade (NDA)",
    "checklist_anpd": "Checklist de Conformidade ANPD",
}


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    uid = new_id()
    doc = {"id": uid, "name": body.name, "email": email,
           "password_hash": hash_password(body.password), "role": body.role,
           "company_id": body.company_id, "created_at": now_iso()}
    await db.users.insert_one(doc)
    access, refresh = create_access_token(uid, email), create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "name": body.name, "email": email, "role": body.role,
            "company_id": body.company_id, "token": access}


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    access, refresh = create_access_token(user["id"], email), create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"id": user["id"], "name": user["name"], "email": email,
            "role": user["role"], "company_id": user.get("company_id"), "token": access}


@api.post("/auth/logout")
async def logout(request: Request, response: Response, user: dict = Depends(get_current_user)):
    st = request.cookies.get("session_token")
    if st:
        await db.user_sessions.delete_one({"session_token": st})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


@api.post("/auth/session")
async def google_session(request: Request, response: Response):
    # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        body = await request.json()
        session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id ausente")
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                        headers={"X-Session-ID": session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessão Google inválida")
    data = r.json()
    email = data["email"].lower()
    user = await db.users.find_one({"email": email})
    if not user:
        role = "admin" if email == os.environ.get("ADMIN_EMAIL", "admin@belotagrc.com.br").lower() else "consultor"
        uid = new_id()
        user = {"id": uid, "name": data.get("name") or email, "email": email,
                "password_hash": "", "role": role, "company_id": None,
                "picture": data.get("picture"), "created_at": now_iso()}
        await db.users.insert_one(user)
    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "session_token": session_token, "user_id": user["id"],
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": now_iso()})
    response.set_cookie("session_token", session_token, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")
    return {"id": user["id"], "name": user["name"], "email": email,
            "role": user["role"], "company_id": user.get("company_id")}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------------------------------------------------------------------------
# Companies / CRM
# ---------------------------------------------------------------------------
def default_company_fields():
    return {"compliance_score": 0, "risk_count": 0, "certified": False}


@api.post("/companies")
async def create_company(body: CompanyIn, user: dict = Depends(require_staff)):
    cid = new_id()
    doc = {"id": cid, **body.model_dump(), **default_company_fields(),
           "consultor_id": user["id"], "dpo_id": None,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.companies.insert_one(doc)
    await log_event(cid, user, "criou", "empresa", body.name)
    doc.pop("_id", None)
    return doc


@api.get("/companies")
async def list_companies(user: dict = Depends(get_current_user)):
    q = {} if user["role"] in STAFF_ROLES else {"id": user.get("company_id")}
    items = await db.companies.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api.get("/companies/{company_id}")
async def get_company(company_id: str, user: dict = Depends(get_current_user)):
    return await get_company_or_403(user, company_id)


@api.put("/companies/{company_id}")
async def update_company(company_id: str, body: CompanyIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.companies.update_one({"id": company_id},
                                  {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    await log_event(company_id, user, "atualizou", "empresa", body.name)
    return await db.companies.find_one({"id": company_id}, {"_id": 0})


@api.delete("/companies/{company_id}")
async def delete_company(company_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.companies.delete_one({"id": company_id})
    for coll in ["inventory", "ropa", "ripd", "risks", "actions", "documents",
                 "trainings", "evidences", "tickets", "diagnostics", "certificates", "events"]:
        await db[coll].delete_many({"company_id": company_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Diagnostic
# ---------------------------------------------------------------------------
@api.get("/diagnostic/template")
async def diagnostic_template(user: dict = Depends(get_current_user)):
    return DIAGNOSTIC


@api.get("/companies/{company_id}/diagnostic")
async def get_diagnostic(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    d = await db.diagnostics.find_one({"company_id": company_id}, {"_id": 0})
    return d or {"company_id": company_id, "answers": {}, "score": 0}


@api.post("/companies/{company_id}/diagnostic")
async def save_diagnostic(company_id: str, body: DiagnosticIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    total = sum(len(d["questions"]) for d in DIAGNOSTIC)
    got = sum(SCORE_WEIGHT.get(v, 0) for v in body.answers.values())
    score = round((got / total) * 100) if total else 0
    domain_scores = []
    for d in DIAGNOSTIC:
        qs = d["questions"]
        dg = sum(SCORE_WEIGHT.get(body.answers.get(q["id"], "nao"), 0) for q in qs)
        domain_scores.append({"domain": d["domain"], "score": round((dg / len(qs)) * 100)})
    doc = {"company_id": company_id, "answers": body.answers, "score": score,
           "domain_scores": domain_scores, "updated_at": now_iso()}
    await db.diagnostics.update_one({"company_id": company_id}, {"$set": doc}, upsert=True)
    await db.companies.update_one({"id": company_id}, {"$set": {"compliance_score": score}})
    await log_event(company_id, user, "concluiu", "diagnóstico", f"Score {score}%")
    return doc


@api.post("/companies/{company_id}/diagnostic/ai-recommendations")
async def diagnostic_recommendations(company_id: str, user: dict = Depends(require_staff)):
    company = await get_company_or_403(user, company_id)
    d = await db.diagnostics.find_one({"company_id": company_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=400, detail="Realize o diagnóstico primeiro")
    gaps = [ds for ds in d.get("domain_scores", []) if ds["score"] < 80]
    job_id = await create_job(company_id, "diagnostic_recommendations")

    async def worker():
        prompt = (f"Empresa: {company['name']} (setor: {company.get('sector','N/A')}). "
                  f"Score de conformidade LGPD: {d['score']}%. "
                  f"Domínios com lacunas: {gaps}. "
                  "Gere um plano de recomendações objetivo em português com ações prioritárias "
                  "para elevar a conformidade à LGPD. Use bullets por domínio.")
        text = await ai_generate(
            "Você é um consultor sênior de GRC e LGPD da BELOTA GRC. Seja técnico e prático.",
            prompt)
        return {"recommendations": text}

    run_job(job_id, worker)
    return {"job_id": job_id}


# ---------------------------------------------------------------------------
# Generic sub-collection CRUD factory
# ---------------------------------------------------------------------------
async def _create_item(coll, company_id, user, data, entity):
    item = {"id": new_id(), "company_id": company_id, **data,
            "created_at": now_iso(), "updated_at": now_iso()}
    await db[coll].insert_one(item)
    await log_event(company_id, user, "criou", entity, data.get("name") or data.get("title", ""))
    item.pop("_id", None)
    return item


async def _list_items(coll, company_id, extra=None):
    q = {"company_id": company_id}
    if extra:
        q.update(extra)
    return await db[coll].find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


# Inventory
@api.post("/companies/{company_id}/inventory")
async def create_inventory(company_id: str, body: InventoryIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    return await _create_item("inventory", company_id, user, body.model_dump(), "inventário")


@api.get("/companies/{company_id}/inventory")
async def list_inventory(company_id: str, type: Optional[str] = None, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await _list_items("inventory", company_id, {"type": type} if type else None)


@api.put("/companies/{company_id}/inventory/{item_id}")
async def update_inventory(company_id: str, item_id: str, body: InventoryIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.inventory.update_one({"id": item_id, "company_id": company_id},
                                  {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    return await db.inventory.find_one({"id": item_id}, {"_id": 0})


@api.delete("/companies/{company_id}/inventory/{item_id}")
async def delete_inventory(company_id: str, item_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.inventory.delete_one({"id": item_id, "company_id": company_id})
    return {"ok": True}


# RoPA
@api.post("/companies/{company_id}/ropa")
async def create_ropa(company_id: str, body: RopaIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    return await _create_item("ropa", company_id, user, body.model_dump(), "RoPA")


@api.get("/companies/{company_id}/ropa")
async def list_ropa(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await _list_items("ropa", company_id)


@api.put("/companies/{company_id}/ropa/{item_id}")
async def update_ropa(company_id: str, item_id: str, body: RopaIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.ropa.update_one({"id": item_id, "company_id": company_id},
                             {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    return await db.ropa.find_one({"id": item_id}, {"_id": 0})


@api.delete("/companies/{company_id}/ropa/{item_id}")
async def delete_ropa(company_id: str, item_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.ropa.delete_one({"id": item_id, "company_id": company_id})
    return {"ok": True}


@api.post("/companies/{company_id}/ropa/ai-suggest")
async def ropa_ai_suggest(company_id: str, user: dict = Depends(require_staff)):
    company = await get_company_or_403(user, company_id)
    inv = await _list_items("inventory", company_id, {"type": "data"})
    inv_names = ", ".join(i["name"] for i in inv) or "genéricos"
    job_id = await create_job(company_id, "ropa_suggest")

    async def worker():
        prompt = (f"Empresa {company['name']}, setor {company.get('sector','N/A')}. "
                  f"Categorias de dados conhecidas: {inv_names}. "
                  "Sugira 3 registros de atividades de tratamento (RoPA) plausíveis em JSON array, "
                  "cada objeto com: process_name, purpose, legal_basis, data_categories, "
                  "data_subjects, retention, recipients, security_measures. Responda SOMENTE o JSON.")
        text = await ai_generate("Você é um especialista LGPD. Responda apenas JSON válido.", prompt)
        return {"suggestion": text}

    run_job(job_id, worker)
    return {"job_id": job_id}


# RIPD
@api.post("/companies/{company_id}/ripd")
async def create_ripd(company_id: str, body: RipdIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    return await _create_item("ripd", company_id, user, body.model_dump(), "RIPD")


@api.get("/companies/{company_id}/ripd")
async def list_ripd(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await _list_items("ripd", company_id)


@api.delete("/companies/{company_id}/ripd/{item_id}")
async def delete_ripd(company_id: str, item_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.ripd.delete_one({"id": item_id, "company_id": company_id})
    return {"ok": True}


@api.post("/companies/{company_id}/ripd/ai-generate")
async def ripd_ai_generate(company_id: str, body: RipdIn, user: dict = Depends(require_staff)):
    company = await get_company_or_403(user, company_id)
    job_id = await create_job(company_id, "ripd_generate")

    async def worker():
        prompt = (f"Gere um Relatório de Impacto à Proteção de Dados Pessoais (RIPD) para a empresa "
                  f"{company['name']} (setor {company.get('sector','N/A')}). "
                  f"Escopo/atividade avaliada: {body.scope or body.title}. "
                  "Estruture em Markdown com seções: 1. Identificação, 2. Descrição do tratamento, "
                  "3. Necessidade e proporcionalidade, 4. Riscos aos titulares, "
                  "5. Medidas de mitigação, 6. Conclusão e nível de risco residual.")
        content = await ai_generate(
            "Você é um DPO especialista em LGPD e elaboração de RIPD/DPIA. Escreva em português formal.",
            prompt)
        item = await _create_item("ripd", company_id, user,
                                  {"title": body.title, "scope": body.scope,
                                   "content": content, "risk_level": body.risk_level}, "RIPD")
        return item

    run_job(job_id, worker)
    return {"job_id": job_id}


# Risks
@api.post("/companies/{company_id}/risks")
async def create_risk(company_id: str, body: RiskIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    data = body.model_dump()
    data["score"] = body.probability * body.impact
    item = await _create_item("risks", company_id, user, data, "risco")
    count = await db.risks.count_documents({"company_id": company_id})
    await db.companies.update_one({"id": company_id}, {"$set": {"risk_count": count}})
    return item


@api.get("/companies/{company_id}/risks")
async def list_risks(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await _list_items("risks", company_id)


@api.put("/companies/{company_id}/risks/{item_id}")
async def update_risk(company_id: str, item_id: str, body: RiskIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    data = body.model_dump()
    data["score"] = body.probability * body.impact
    await db.risks.update_one({"id": item_id, "company_id": company_id},
                              {"$set": {**data, "updated_at": now_iso()}})
    return await db.risks.find_one({"id": item_id}, {"_id": 0})


@api.delete("/companies/{company_id}/risks/{item_id}")
async def delete_risk(company_id: str, item_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.risks.delete_one({"id": item_id, "company_id": company_id})
    count = await db.risks.count_documents({"company_id": company_id})
    await db.companies.update_one({"id": company_id}, {"$set": {"risk_count": count}})
    return {"ok": True}


# Actions
@api.post("/companies/{company_id}/actions")
async def create_action(company_id: str, body: ActionIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    return await _create_item("actions", company_id, user, body.model_dump(), "ação")


@api.get("/companies/{company_id}/actions")
async def list_actions(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await _list_items("actions", company_id)


@api.put("/companies/{company_id}/actions/{item_id}")
async def update_action(company_id: str, item_id: str, body: ActionIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.actions.update_one({"id": item_id, "company_id": company_id},
                                {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    return await db.actions.find_one({"id": item_id}, {"_id": 0})


@api.delete("/companies/{company_id}/actions/{item_id}")
async def delete_action(company_id: str, item_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.actions.delete_one({"id": item_id, "company_id": company_id})
    return {"ok": True}


# Documents
@api.get("/documents/catalog")
async def doc_catalog(user: dict = Depends(get_current_user)):
    return [{"type": k, "name": v} for k, v in DOC_CATALOG.items()]


@api.post("/companies/{company_id}/documents/generate")
async def generate_document(company_id: str, body: DocGenIn, user: dict = Depends(require_staff)):
    company = await get_company_or_403(user, company_id)
    doc_name = DOC_CATALOG.get(body.doc_type, body.doc_type)
    title = body.title or f"{doc_name} - {company['name']}"
    job_id = await create_job(company_id, "document_generate")

    async def worker():
        prompt = (f"Elabore o documento '{doc_name}' para a empresa {company['name']} "
                  f"(CNPJ {company.get('cnpj') or 'N/A'}, setor {company.get('sector','N/A')}), "
                  f"em conformidade com a LGPD (Lei 13.709/2018). "
                  f"{('Instruções adicionais: ' + body.instructions) if body.instructions else ''} "
                  "Escreva um documento profissional e completo em português, formatado em Markdown, "
                  "pronto para uso corporativo, com cláusulas e seções apropriadas.")
        content = await ai_generate(
            "Você é um advogado especialista em LGPD e governança corporativa da BELOTA GRC. "
            "Produza documentos jurídicos completos, formais e prontos para assinatura.",
            prompt)
        item = await _create_item("documents", company_id, user,
                                  {"doc_type": body.doc_type, "title": title,
                                   "content": content, "status": "rascunho",
                                   "generated_by_ai": True}, "documento")
        return item

    run_job(job_id, worker)
    return {"job_id": job_id}


@api.get("/companies/{company_id}/jobs/{job_id}")
async def get_job(company_id: str, job_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    job = await db.ai_jobs.find_one({"id": job_id, "company_id": company_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return job


@api.get("/companies/{company_id}/documents")
async def list_documents(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await _list_items("documents", company_id)


@api.get("/companies/{company_id}/documents/{doc_id}")
async def get_document(company_id: str, doc_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    doc = await db.documents.find_one({"id": doc_id, "company_id": company_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return doc


@api.put("/companies/{company_id}/documents/{doc_id}")
async def update_document(company_id: str, doc_id: str, body: DocUpdateIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    upd["updated_at"] = now_iso()
    await db.documents.update_one({"id": doc_id, "company_id": company_id}, {"$set": upd})
    return await db.documents.find_one({"id": doc_id}, {"_id": 0})


@api.delete("/companies/{company_id}/documents/{doc_id}")
async def delete_document(company_id: str, doc_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.documents.delete_one({"id": doc_id, "company_id": company_id})
    return {"ok": True}


# Trainings
@api.post("/companies/{company_id}/trainings")
async def create_training(company_id: str, body: TrainingIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    return await _create_item("trainings", company_id, user, body.model_dump(), "treinamento")


@api.get("/companies/{company_id}/trainings")
async def list_trainings(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await _list_items("trainings", company_id)


@api.put("/companies/{company_id}/trainings/{item_id}")
async def update_training(company_id: str, item_id: str, body: TrainingIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.trainings.update_one({"id": item_id, "company_id": company_id},
                                  {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    return await db.trainings.find_one({"id": item_id}, {"_id": 0})


@api.delete("/companies/{company_id}/trainings/{item_id}")
async def delete_training(company_id: str, item_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.trainings.delete_one({"id": item_id, "company_id": company_id})
    return {"ok": True}


# Evidences
@api.post("/companies/{company_id}/evidences")
async def create_evidence(company_id: str, body: EvidenceIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    return await _create_item("evidences", company_id, user, body.model_dump(), "evidência")


@api.get("/companies/{company_id}/evidences")
async def list_evidences(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await _list_items("evidences", company_id)


@api.delete("/companies/{company_id}/evidences/{item_id}")
async def delete_evidence(company_id: str, item_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    await db.evidences.delete_one({"id": item_id, "company_id": company_id})
    return {"ok": True}


# Tickets (data subject requests)
@api.post("/companies/{company_id}/tickets")
async def create_ticket(company_id: str, body: TicketIn, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    protocol = "BEL-" + secrets.token_hex(4).upper()
    return await _create_item("tickets", company_id, user,
                              {**body.model_dump(), "protocol": protocol,
                               "status": "aberto", "resolution": ""}, "ticket")


@api.get("/companies/{company_id}/tickets")
async def list_tickets(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await _list_items("tickets", company_id)


@api.put("/companies/{company_id}/tickets/{item_id}")
async def update_ticket(company_id: str, item_id: str, body: TicketUpdateIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    upd["updated_at"] = now_iso()
    await db.tickets.update_one({"id": item_id, "company_id": company_id}, {"$set": upd})
    return await db.tickets.find_one({"id": item_id}, {"_id": 0})


# Certificate / Seal
@api.post("/companies/{company_id}/certificate")
async def issue_certificate(company_id: str, user: dict = Depends(require_staff)):
    company = await get_company_or_403(user, company_id)
    score = company.get("compliance_score", 0)
    if score < 70:
        raise HTTPException(status_code=400,
                            detail=f"Score de conformidade insuficiente ({score}%). Mínimo 70% para certificação.")
    cert_id = "BELOTA-" + secrets.token_hex(6).upper()
    now = datetime.now(timezone.utc)
    doc = {"id": new_id(), "company_id": company_id, "certificate_id": cert_id,
           "seal_type": "VERIFIED", "score": score, "issued_by": user["name"],
           "issued_at": now.isoformat(),
           "valid_until": (now + timedelta(days=365)).isoformat(),
           "created_at": now_iso()}
    await db.certificates.update_one({"company_id": company_id}, {"$set": doc}, upsert=True)
    await db.companies.update_one({"id": company_id}, {"$set": {"certified": True}})
    await log_event(company_id, user, "emitiu", "certificado", cert_id)
    doc.pop("_id", None)
    return doc


@api.get("/companies/{company_id}/certificate")
async def get_certificate(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    cert = await db.certificates.find_one({"company_id": company_id}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Sem certificado emitido")
    return cert


# Events / audit trail
@api.get("/companies/{company_id}/events")
async def list_events(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await db.events.find({"company_id": company_id}, {"_id": 0}).sort("created_at", -1).to_list(200)


# Dashboards
@api.get("/companies/{company_id}/dashboard")
async def company_dashboard(company_id: str, user: dict = Depends(get_current_user)):
    company = await get_company_or_403(user, company_id)
    diag = await db.diagnostics.find_one({"company_id": company_id}, {"_id": 0})
    risks = await _list_items("risks", company_id)
    actions = await _list_items("actions", company_id)
    counts = {}
    for coll in ["inventory", "ropa", "ripd", "documents", "trainings", "evidences", "tickets"]:
        counts[coll] = await db[coll].count_documents({"company_id": company_id})
    open_actions = len([a for a in actions if a.get("status") != "concluida"])
    critical_risks = len([r for r in risks if r.get("score", 0) >= 15])
    cert = await db.certificates.find_one({"company_id": company_id}, {"_id": 0})
    return {
        "company": company,
        "compliance_score": company.get("compliance_score", 0),
        "domain_scores": diag.get("domain_scores", []) if diag else [],
        "counts": counts, "risks": risks,
        "open_actions": open_actions, "total_actions": len(actions),
        "critical_risks": critical_risks, "certificate": cert,
    }


@api.get("/dashboard")
async def global_dashboard(user: dict = Depends(get_current_user)):
    q = {} if user["role"] in STAFF_ROLES else {"id": user.get("company_id")}
    companies = await db.companies.find(q, {"_id": 0}).to_list(1000)
    by_stage = {}
    for c in companies:
        by_stage[c.get("stage", "lead")] = by_stage.get(c.get("stage", "lead"), 0) + 1
    scores = [c.get("compliance_score", 0) for c in companies]
    avg = round(sum(scores) / len(scores)) if scores else 0
    return {
        "total_companies": len(companies),
        "certified": len([c for c in companies if c.get("certified")]),
        "avg_score": avg,
        "by_stage": by_stage,
        "companies": companies,
    }


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@belotagrc.com.br").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "belota2026")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(), "name": "Fred Belota", "email": admin_email,
            "password_hash": hash_password(admin_pw), "role": "admin",
            "company_id": None, "created_at": now_iso()})
        logger.info("Admin seeded: %s", admin_email)
    elif not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_pw)}})


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------------------------------------------------------------------------
# Premium modules (Sprint 1-4)
# ---------------------------------------------------------------------------
from modules import contract_review as _cr
from modules import roadmap as _rm
from modules import pdf_export as _pe
api.include_router(_cr.router)
api.include_router(_rm.router)
api.include_router(_pe.router)
from modules import dpo_licit as _dl
api.include_router(_dl.router)

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# SPA static serving (deploy fora do Emergent)
# ---------------------------------------------------------------------------
STATIC_DIR = ROOT_DIR / "static"

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(404)
    fp = STATIC_DIR / full_path
    if full_path and fp.exists() and fp.is_file():
        return FileResponse(fp)
    idx = STATIC_DIR / "index.html"
    if idx.exists():
        return FileResponse(idx)
    raise HTTPException(404)
