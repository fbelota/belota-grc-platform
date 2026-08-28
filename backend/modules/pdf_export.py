"""PDFs: Certificado VERIFIED com QR Code + Documentos"""
import io, base64, qrcode, markdown
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from xhtml2pdf import pisa
from server import db, get_current_user, get_company_or_403

router = APIRouter()
GOLD = "#C9A227"

def qr_b64(data):
    qr = qrcode.QRCode(box_size=10, border=2)
    qr.add_data(data); qr.make(fit=True)
    img = qr.make_image()
    buf = io.BytesIO(); img.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()

def render(html):
    buf = io.BytesIO()
    st = pisa.CreatePDF(io.StringIO(html), dest=buf)
    if st.err:
        raise HTTPException(500, "Erro ao gerar PDF")
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf")

@router.get("/companies/{company_id}/certificate/pdf")
async def cert_pdf(company_id: str, user: dict = Depends(get_current_user)):
    company = await get_company_or_403(user, company_id)
    cert = await db.certificates.find_one({"company_id": company_id}, {"_id": 0})
    if not cert:
        raise HTTPException(404, "Certificado nao emitido")
    em = datetime.fromisoformat(cert["issued_at"]).strftime("%d/%m/%Y")
    va = datetime.fromisoformat(cert["valid_until"]).strftime("%d/%m/%Y")
    qr = qr_b64(f"https://belotagrc.com.br/verify/{cert['certificate_id']}")
    html = f"""<html><head><meta charset="UTF-8"/><style>
    @page {{size: A4 landscape; margin: 0;}}
    body {{font-family: Helvetica; background: #0B1220; color: #fff; padding: 40px;}}
    .c {{border: 3px solid {GOLD}; padding: 50px; text-align: center;}}
    .logo {{color: {GOLD}; font-size: 26px; font-weight: bold; letter-spacing: 4px;}}
    .sub {{color: #888; font-size: 11px; letter-spacing: 3px;}}
    .t {{color: {GOLD}; font-size: 30px; font-weight: bold; margin: 25px 0;}}
    .n {{color: {GOLD}; font-size: 28px; font-weight: bold; margin: 15px 0;}}
    .s {{color: {GOLD}; font-size: 13px; letter-spacing: 3px; font-weight: bold; margin-top: 15px;}}
    .f {{margin-top: 30px; display: flex; justify-content: space-between; align-items: center; text-align: left;}}
    .i {{font-size: 10px; color: #999;}}
    </style></head><body><div class="c">
    <div class="logo">BELOTA GRC</div>
    <div class="sub">GOVERNANCA · RISCO · COMPLIANCE · LGPD</div>
    <div class="t">CERTIFICADO DE CONFORMIDADE</div>
    <p>Certificamos que a empresa</p>
    <div class="n">{company['name']}</div>
    <p>concluiu o Programa de Governanca Premium BELOTA GRC Framework™<br/>
    em conformidade com a Lei 13.709/2018 (LGPD).</p>
    <p>Score de Conformidade: <b style="color:{GOLD}">{cert.get('score',0)}%</b></p>
    <div class="s">◆ BELOTA GRC VERIFIED™ ◆</div>
    <div class="f"><div class="i">Certificado: {cert['certificate_id']}<br/>Emitido em: {em}<br/>Valido ate: {va}<br/>Emitido por: {cert.get('issued_by','BELOTA GRC')}</div>
    <img src="data:image/png;base64,{qr}" style="width:110px;height:110px"/></div>
    </div></body></html>"""
    return render(html)

@router.get("/companies/{company_id}/documents/{doc_id}/pdf")
async def doc_pdf(company_id: str, doc_id: str, user: dict = Depends(get_current_user)):
    await get_company_or_403(user, company_id)
    doc = await db.documents.find_one({"id": doc_id, "company_id": company_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Documento nao encontrado")
    body = markdown.markdown(doc.get("content", ""))
    html = f"""<html><head><meta charset="UTF-8"/><style>
    @page {{size: A4; margin: 2.5cm;}}
    body {{font-family: Helvetica; color: #222; line-height: 1.6;}}
    .h {{border-bottom: 3px solid {GOLD}; padding-bottom: 12px; margin-bottom: 25px;}}
    .logo {{color: {GOLD}; font-size: 20px; font-weight: bold; letter-spacing: 3px;}}
    h1 {{color: #111;}} h2 {{color: {GOLD};}}
    table {{border-collapse: collapse; width: 100%;}} th,td {{border: 1px solid #ccc; padding: 6px;}}
    </style></head><body>
    <div class="h"><div class="logo">BELOTA GRC</div>
    <div style="color:#666;font-size:9px;letter-spacing:2px">GOVERNANCA · RISCO · COMPLIANCE · LGPD</div></div>
    <h1>{doc.get('title','Documento')}</h1>{body}
    <p style="font-size:9px;color:#888;margin-top:30px">BELOTA GRC CONSULTORIA · {datetime.now().strftime('%d/%m/%Y')}</p>
    </body></html>"""
    return render(html)
