# Test Credentials — BELOTA GRC Platform

## Admin / Owner (staff, role=admin)
- Email: fredbelota@gmail.com
- Password: Belota@2025
- Role: admin (full access to all companies/tenants)

## Roles
- admin / consultor / dpo = staff (STAFF_ROLES) — manage all companies & modules
- cliente = client portal user, scoped to their own company_id only

## Register test users (POST /api/auth/register)
- Body: {"name","email","password","role": "consultor|dpo|cliente", "company_id"?}

## Auth endpoints (all under /api/auth)
- POST /api/auth/register
- POST /api/auth/login   -> sets httpOnly cookies + returns token
- POST /api/auth/logout
- GET  /api/auth/me

Auth: JWT via httpOnly cookies (access 12h, refresh 7d). Frontend sends credentials: include.
