import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, fmtErr } from "../context/AuthContext";
import { Shield } from "../components/Logo";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

export default function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "consultor", company_id: "" });
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register({ name: form.name, email: form.email, password: form.password, role: form.role, company_id: form.company_id || undefined });
      toast.success("Bem-vindo à plataforma BELOTA GRC");
      nav("/");
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-belota-bg text-belota-text">
      <div className="relative hidden lg:flex flex-col justify-between p-12 grain overflow-hidden"
        style={{ background: "linear-gradient(140deg,#050A14 0%,#0B1426 60%,#0F3D2B 140%)" }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "url(https://images.pexels.com/photos/5042025/pexels-photo-5042025.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940)", backgroundSize: "cover" }} />
        <div className="relative z-10 flex items-center gap-3">
          <Shield className="w-11 h-11" />
          <div>
            <div className="font-heading font-bold text-xl">BELOTA <span className="text-belota-gold">GRC</span></div>
            <div className="overline">Governance Operating System</div>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="font-heading text-4xl lg:text-5xl font-bold leading-tight tracking-tight">
            O Sistema Operacional de <span className="text-belota-gold">Governança</span> do Brasil
          </h1>
          <p className="mt-5 text-belota-muted leading-relaxed">
            Do primeiro contato comercial à conformidade contínua. Diagnóstico, RoPA, RIPD,
            matriz de riscos, documentos, evidências e certificação — orquestrados por IA.
          </p>
          <div className="mt-8 flex gap-6 text-sm">
            {["Compliance", "Privacy", "Security", "Audit"].map((x) => (
              <span key={x} className="text-belota-muted">
                <span className="text-belota-gold">◆</span> {x} by Design
              </span>
            ))}
          </div>
        </div>
        <div className="relative z-10 overline">BELOTA GRC Framework™ · DPO as a Service™</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <Shield className="w-10 h-10" />
            <span className="font-heading font-bold text-xl">BELOTA GRC</span>
          </div>
          <div className="bg-belota-surface border border-belota-border rounded-md p-8">
            <div className="overline mb-1">{mode === "login" ? "Acesso à plataforma" : "Criar conta"}</div>
            <h2 className="font-heading text-2xl font-semibold mb-6">
              {mode === "login" ? "Entrar" : "Registrar equipe"}
            </h2>
            <form onSubmit={submit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <Label className="text-belota-muted">Nome</Label>
                  <Input data-testid="name-input" value={form.name} onChange={set("name")} required
                    className="bg-belota-bg border-belota-border mt-1" placeholder="Seu nome" />
                </div>
              )}
              <div>
                <Label className="text-belota-muted">E-mail</Label>
                <Input data-testid="email-input" type="email" value={form.email} onChange={set("email")} required
                  className="bg-belota-bg border-belota-border mt-1" placeholder="voce@empresa.com" />
              </div>
              <div>
                <Label className="text-belota-muted">Senha</Label>
                <Input data-testid="password-input" type="password" value={form.password} onChange={set("password")} required
                  className="bg-belota-bg border-belota-border mt-1" placeholder="••••••••" />
              </div>
              {mode === "register" && (
                <div>
                  <Label className="text-belota-muted">Perfil</Label>
                  <select data-testid="role-select" value={form.role} onChange={set("role")}
                    className="w-full mt-1 bg-belota-bg border border-belota-border rounded-sm h-10 px-3 text-sm">
                    <option value="consultor">Consultor</option>
                    <option value="dpo">DPO</option>
                    <option value="cliente">Cliente</option>
                  </select>
                </div>
)}
{mode === "register" && form.role === "cliente" && (
  <div>
    <Label className="text-belota-muted">Código da empresa (ID)</Label>
    <Input value={form.company_id} onChange={set("company_id")}
      className="bg-belota-bg border-belota-border mt-1" placeholder="Cole o ID da empresa" />
  </div>
)}
              <Button data-testid="submit-btn" type="submit" disabled={loading}
                className="w-full bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm font-medium">
                {loading ? "Processando..." : mode === "login" ? "Entrar" : "Criar conta"}
              </Button>
            </form>
            <div className="mt-5 text-center text-sm text-belota-muted">
              {mode === "login" ? "Não tem conta?" : "Já possui conta?"}{" "}
              <button data-testid="toggle-mode" onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-belota-gold hover:underline">
                {mode === "login" ? "Registrar" : "Entrar"}
              </button>
            </div>
          </div>
          <p className="text-center text-xs text-belota-muted mt-4">
            Governança · Risco · Compliance · LGPD
          </p>
        </div>
      </div>
    </div>
  );
}
