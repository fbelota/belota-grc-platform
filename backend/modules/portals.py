"""Portais Consultor/DPO - visao consolidada multi-cliente"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from server import db, get_current_user, require_staff

router = APIRouter()

@router.get("/portal/staff")
async def staff_alerts(user: dict = Depends(require_staff)):
    now = datetime.now(timezone.utc).isoformat()
    out = []
    for c in await db.companies.find({}, {"_id": 0}).to_list(500):
        cid = c["id"]
        out.append({
            "company_id": cid, "name": c.get("name"), "stage": c.get("stage"),
            "score": c.get("compliance_score", 0), "certified": c.get("certified", False),
            "critical_risks": await db.risks.count_documents({"company_id": cid, "score": {"$gte": 15}}),
            "open_actions": await db.actions.count_documents({"company_id": cid, "status": {"$ne": "concluida"}}),
            "overdue_tasks": await db.roadmaps.count_documents({"company_id": cid, "status": {"$ne": "concluida"}, "due_date": {"$lt": now}}),
            "open_tickets": await db.tickets.count_documents({"company_id": cid, "status": "aberto"}),
            "contracts_pending": await db.contract_reviews.count_documents({"company_id": cid, "status": "em_revisao"}),
            "licit_pending": await db.licitations.count_documents({"company_id": cid, "status": "em_analise"}),
        })
    out.sort(key=lambda x: x["score"])
    return out

@router.get("/portal/dpo")
async def dpo_queue(user: dict = Depends(require_staff)):
    names = {c["id"]: c.get("name") for c in await db.companies.find({}, {"_id": 0}).to_list(500)}
    tasks = await db.dpo_plans.find({"status": "pendente"}).sort("due_date", 1).to_list(200)
    for t in tasks:
        t["company_name"] = names.get(t["company_id"], "?")
    tickets = await db.tickets.find({"status": "aberto"}).sort("created_at", 1).to_list(100)
    for t in tickets:
        t["company_name"] = names.get(t["company_id"], "?")
    return {"tasks": tasks, "tickets": tickets}