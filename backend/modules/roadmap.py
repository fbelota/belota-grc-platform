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
