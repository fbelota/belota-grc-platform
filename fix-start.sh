#!/bin/bash
cd /app
echo "=== 1) Verificacao dos patches ==="
echo -n "server.py registrado: "; grep -c "from modules import" backend/server.py
echo -n "CompanyDetail com novas tabs: "; grep -c "ContractReview" frontend/src/pages/CompanyDetail.jsx

echo "=== 2) Dependencias do backend ==="
pip install -q uvicorn qrcode Pillow 2>/dev/null || pip3 install -q uvicorn qrcode Pillow

echo "=== 3) Subir backend ==="
pkill -f "uvicorn server:app" 2>/dev/null || true
sleep 1
cd /app/backend
if python3 -c "import uvicorn" 2>/dev/null; then
  nohup python3 -m uvicorn server:app --host 0.0.0.0 --port 8000 > /tmp/belota_backend.log 2>&1 &
else
  nohup uvicorn server:app --host 0.0.0.0 --port 8000 > /tmp/belota_backend.log 2>&1 &
fi
sleep 5
tail -3 /tmp/belota_backend.log
curl -s -o /dev/null -w "API: HTTP %{http_code}\n" http://localhost:8000/docs

echo "=== 4) Frontend ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
echo "FE: HTTP $CODE"
if [ "$CODE" != "200" ]; then
  cd /app/frontend && nohup yarn start > /tmp/belota_frontend.log 2>&1 &
  sleep 8
  curl -s -o /dev/null -w "FE (retry): HTTP %{http_code}\n" http://localhost:3000
fi
echo "=== FIM ==="