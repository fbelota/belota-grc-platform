#!/bin/bash
cd /app || exit 1
echo "=== [1/5] Portabilidade: ai_provider + Dockerfile ==="
cat > backend/ai_provider.py <<'AIPY'
"""AI Provider portavel (Anthropic ou OpenAI) - funciona fora do Emergent"""
import os
import httpx

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

async def ai_generate(system_message: str, prompt: str) -> str:
    if ANTHROPIC_API_KEY:
        async with httpx.AsyncClient(timeout=180) as c:
            r = await c.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": ANTHROPIC_API_KEY,
                         "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model": os.environ.get("AI_MODEL", "claude-sonnet-4-20250514"),
                      "max_tokens": 4000,
                      "system": system_message,
                      "messages": [{"role": "user", "content": prompt}]})
            r.raise_for_status()
            return r.json()["content"][0]["text"]
    if OPENAI_API_KEY:
        async with httpx.AsyncClient(timeout=180) as c:
            r = await c.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={"model": os.environ.get("AI_MODEL", "gpt-4o-mini"),
                      "messages": [{"role": "system", "content": system_message},
                                   {"role": "user", "content": prompt}]})
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
    raise RuntimeError("Defina ANTHROPIC_API_KEY ou OPENAI_API_KEY no ambiente")
AIPY

cat > Dockerfile <<'DOCKER'
FROM node:20 AS fe
WORKDIR /fe
COPY frontend/package.json frontend/yarn.lock ./
RUN node -e "const f=require('fs');const p=JSON.parse(f.readFileSync('package.json'));delete (p.devDependencies||{})['@emergentbase/visual-edits'];f.writeFileSync('package.json',JSON.stringify(p,null,2))"
RUN yarn install --network-timeout 600000
COPY frontend/ .
RUN CI=false yarn build

FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt uvicorn qrcode Pillow
COPY backend/ .
COPY --from=fe /fe/build ./static
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
DOCKER

echo "=== [2/5] Patches de portabilidade no server.py ==="
python3 - <<'PYPATCH'
s = open("/app/backend/server.py", encoding="utf-8").read()

s = s.replace("from fastapi.responses import StreamingResponse",
              "from fastapi.responses import StreamingResponse, FileResponse", 1)

s = s.replace("EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']",
              "EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')", 1)

s = s.replace('os.environ["ADMIN_EMAIL"]', 'os.environ.get("ADMIN_EMAIL", "admin@belotagrc.com.br")')
s = s.replace('os.environ["ADMIN_PASSWORD"]', 'os.environ.get("ADMIN_PASSWORD", "belota2026")')

old_imp = "from emergentintegrations.llm.chat import LlmChat, UserMessage"
new_imp = """try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    _HAS_EMERGENT_LLM = True
except Exception:
    _HAS_EMERGENT_LLM = False
    from ai_provider import ai_generate as _portable_ai_generate"""
if old_imp in s:
    s = s.replace(old_imp, new_imp, 1)

old_ai = '''async def ai_generate(system_message: str, prompt: str) -> str:
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=new_id(),
                   system_message=system_message).with_model("anthropic", "claude-sonnet-4-6")
    resp = await chat.send_message(UserMessage(text=prompt))
    return resp if isinstance(resp, str) else str(resp)'''
new_ai = '''async def ai_generate(system_message: str, prompt: str) -> str:
    if _HAS_EMERGENT_LLM and EMERGENT_LLM_KEY:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=new_id(),
                       system_message=system_message).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=prompt))
        return resp if isinstance(resp, str) else str(resp)
    return await _portable_ai_generate(system_message, prompt)'''
if old_ai in s:
    s = s.replace(old_ai, new_ai, 1)

if "serve_spa" not in s:
    s += '''
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
'''
open("/app/backend/server.py", "w", encoding="utf-8").write(s)
print("SERVER PATCH OK")
PYPATCH

echo "=== [3/5] Sobe backend com o venv certo ==="
VENV=/root/.venv/bin/python
[ -x "$VENV" ] || VENV=/opt/plugins-venv/bin/python
pkill -f "uvicorn server:app" 2>/dev/null || true
sleep 1
cd /app/backend && nohup $VENV -m uvicorn server:app --host 0.0.0.0 --port 8000 > /tmp/belota_backend.log 2>&1 &
sleep 5
curl -s -o /dev/null -w "API Emergent: HTTP %{http_code}\n" http://localhost:8000/docs

echo "=== [4/5] Valida sintaxe ==="
$VENV -c "import ast; ast.parse(open('/app/backend/server.py').read()); ast.parse(open('/app/backend/ai_provider.py').read()); print('PYTHON OK')"

echo "=== [5/5] Push para o GitHub ==="
cd /app
git add -A && git commit -m "Migracao: Docker, AI provider portatil, SPA serving - pronto p/ Render" && git push origin main
echo "=== MIGRACAO PREPARADA ==="