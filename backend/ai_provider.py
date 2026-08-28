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
