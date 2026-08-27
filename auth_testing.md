# Auth Testing — BELOTA GRC

Admin: fredbelota@gmail.com / Belota@2025 (role=admin)

## API test
curl -c cookies.txt -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"email":"fredbelota@gmail.com","password":"Belota@2025"}'
curl -b cookies.txt http://localhost:8001/api/auth/me

Login returns user object + token and sets access_token/refresh_token cookies.
Staff roles (admin/consultor/dpo) can create/manage companies; cliente is scoped to own company_id.
