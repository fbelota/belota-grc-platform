"""Evidence Engine - hash SHA-256 encadeado (imutavel)"""
import hashlib
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from server import (db, now_iso, new_id, log_event, get_current_user,
                    require_staff, get_company_or_403)

router = APIRouter()

def payload_hash(company_id, e, prev):
    base = "|".join([company_id, e.get("title", ""), e.get("module", ""),
                     e.get("reference", ""), e.get("description", ""),
                     e.get("created_at", ""), prev or "GENESIS"])
    return hashlib.sha256(base.encode()).hexdigest()

class EvidenceIn(BaseModel):
    title: str
    module: str = ""
    description: str = ""
    reference: str = ""

@router.post("/companies/{company_id}/evidence-chain")
async def create_hashed(company_id: str, body: EvidenceIn, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    last = await db.evidences.find_one({"company_id": company_id}, sort=[("created_at", -1)])
    prev = (last or {}).get("hash")
    item = {"id": new_id(), "company_id": company_id, **body.model_dump(),
            "created_at": now_iso(), "updated_at": now_iso(),
            "created_by": user.get("name")}
    item["prev_hash"] = prev or "GENESIS"
    item["hash"] = payload_hash(company_id, item, prev)
    await db.evidences.insert_one(item)
    await log_event(company_id, user, "selou", "evidencia", item["title"])
    item.pop("_id", None)
    return item

@router.get("/companies/{company_id}/evidence-chain")
async def list_chain(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    return await db.evidences.find({"company_id": company_id}, {"_id": 0}).sort("created_at", 1).to_list(500)

@router.post("/companies/{company_id}/evidence-chain/seal")
async def seal_past(company_id: str, user: dict = Depends(require_staff)):
    await get_company_or_403(user, company_id)
    items = await db.evidences.find({"company_id": company_id}).sort("created_at", 1).to_list(500)
    prev = None
    changed = 0
    for e in items:
        if e.get("hash"):
            prev = e["hash"]
            continue
        h = payload_hash(company_id, e, prev)
        await db.evidences.update_one({"id": e["id"]},
            {"$set": {"hash": h, "prev_hash": prev or "GENESIS"}})
        prev = h
        changed += 1
    await log_event(company_id, user, "selou-lote", "evidencias", str(changed))
    return {"sealed": changed}

@router.get("/companies/{company_id}/evidence-chain/verify")
async def verify_chain(company_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    items = await db.evidences.find({"company_id": company_id}).sort("created_at", 1).to_list(500)
    prev = None
    broken = []
    for e in items:
        if not e.get("hash"):
            broken.append({"id": e["id"], "title": e.get("title"), "issue": "sem_hash"})
            prev = None
            continue
        if (e.get("prev_hash") or "GENESIS") != (prev or "GENESIS"):
            broken.append({"id": e["id"], "title": e.get("title"), "issue": "elo_quebrado"})
        if payload_hash(company_id, e, e.get("prev_hash")) != e["hash"]:
            broken.append({"id": e["id"], "title": e.get("title"), "issue": "hash_divergente"})
        prev = e["hash"]
    return {"intact": len(broken) == 0, "checked": len(items), "broken": broken}