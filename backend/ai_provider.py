"""AI Provider portavel - Anthropic com fallback de modelos, ou OpenAI"""
import os
import httpx

class ModelNotFound(Exception):
    def __init__(self, model, body):
        self.model = model
        self.body = body
        super().__init__(f"Modelo nao disponivel: {model}")

MODELS_FALLBACK = [
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-20250514",
    "claude-3-7-sonnet-latest",
    "claude-3-5-haiku-latest",
]

async def _anthropic(model, system_message, prompt, key):
    async with httpx.AsyncClient(timeout=300) as c:
        r = await c.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": model, "max_tokens": 8000,
                  "system": system_message,
                  "messages": [{"role": "user", "content": prompt}]})
        if r.status_code == 404:
            raise ModelNotFound(model, r.text[:300])
        if r.status_code != 200:
            raise RuntimeError(f"Anthropic HTTP {r.status_code}: {r.text[:400]}")
        return r.json()["content"][0]["text"]

async def ai_generate(system_message: str, prompt: str) -> str:
    AK = os.environ.get("ANTHROPIC_API_KEY", "")
    OK = os.environ.get("OPENAI_API_KEY", "")
    if AK:
        models = [os.environ.get("AI_MODEL", "")] + MODELS_FALLBACK
        models = [m for m in dict.fromkeys(models) if m]
        last = None
        for m in models:
            try:
                return await _anthropic(m, system_message, prompt, AK)
            except ModelNotFound as e:
                last = e
                continue
        raise RuntimeError(f"Todos os modelos retornaram 404. Ultimo: {last.model} | {last.body}")
    if OK:
        async with httpx.AsyncClient(timeout=300) as c:
            r = await c.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OK}"},
                json={"model": os.environ.get("AI_MODEL", "gpt-4o-mini"),
                      "messages": [{"role": "system", "content": system_message},
                                   {"role": "user", "content": prompt}]})
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
    raise RuntimeError("Defina ANTHROPIC_API_KEY ou OPENAI_API_KEY no ambiente")
