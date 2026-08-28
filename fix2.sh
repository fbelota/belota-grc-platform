#!/bin/bash
echo "=== 1) Procurar python com as dependencias ==="
PY=""
for P in /usr/bin/python3 /usr/bin/python /opt/venv/bin/python /venv/bin/python /root/venv/bin/python /app/backend/venv/bin/python python3 python; do
  C=$(command -v $P 2>/dev/null) || continue
  if $C -c "import fastapi, dotenv, motor" 2>/dev/null; then PY=$C; echo "PYTHON OK: $PY"; break; fi
done
if [ -z "$PY" ]; then
  echo "Nenhum python completo achado; procurando venvs:"
  find / -maxdepth 5 -name "activate" -path "*/bin/*" 2>/dev/null | head -5
fi

echo "=== 2) Pistas de como o backend rodava ==="
grep -iE "uvicorn|server:app" /root/.bash_history 2>/dev/null | tail -5
ls /app/.emergent 2>/dev/null

echo "=== 3) Subir backend ==="
pkill -f "uvicorn server:app" 2>/dev/null || true
sleep 1
cd /app/backend
if [ -n "$PY" ]; then
  nohup $PY -m uvicorn server:app --host 0.0.0.0 --port 8000 > /tmp/belota_backend.log 2>&1 &
else
  echo "Fallback: instalando requirements no python3..."
  pip install -q -r requirements.txt uvicorn qrcode Pillow 2>/dev/null || pip3 install -q -r requirements.txt uvicorn qrcode Pillow
  nohup python3 -m uvicorn server:app --host 0.0.0.0 --port 8000 > /tmp/belota_backend.log 2>&1 &
fi
sleep 6
tail -4 /tmp/belota_backend.log
curl -s -o /dev/null -w "API: HTTP %{http_code}\n" http://localhost:8000/docs
echo "=== FIM ==="