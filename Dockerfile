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
