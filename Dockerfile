FROM node:20 AS fe
WORKDIR /fe
COPY frontend/package.json frontend/yarn.lock ./
RUN node -e "const f=require('fs');const p=JSON.parse(f.readFileSync('package.json'));delete (p.devDependencies||{})['@emergentbase/visual-edits'];f.writeFileSync('package.json',JSON.stringify(p,null,2))"
RUN yarn install --network-timeout 600000
COPY frontend/ .
ENV REACT_APP_BACKEND_URL=""
RUN CI=false yarn build

FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN grep -v "emergentintegrations" requirements.txt > req.txt && pip install --no-cache-dir -r req.txt uvicorn qrcode Pillow httpx markdown xhtml2pdf
COPY backend/ .
COPY --from=fe /fe/build ./static
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
