import React from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo, Shield } from "./Logo";
import { LayoutDashboard, Building2, LogOut, ShieldCheck } from "lucide-react";

const ROLE_LABEL = { admin: "Administrador", consultor: "Consultor", dpo: "DPO", cliente: "Cliente" };

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const isStaff = ["admin", "consultor", "dpo"].includes(user?.role);

  const items = [
    { to: "/", label: "Painel Executivo", icon: LayoutDashboard, end: true },
    { to: "/empresas", label: isStaff ? "CRM / Empresas" : "Minha Empresa", icon: Building2 },
  ];

  return (
    <div className="min-h-screen flex bg-belota-bg text-belota-text">
      <aside className="w-64 shrink-0 bg-belota-surface border-r border-belota-border flex flex-col fixed h-screen">
        <div className="px-5 py-5 border-b border-belota-border">
          <Logo />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((it) => {
            const Icon = it.icon;
            const active = it.end ? loc.pathname === it.to : loc.pathname.startsWith(it.to);
            return (
              <NavLink key={it.to} to={it.to} data-testid={`nav-${it.label}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-colors ${
                  active ? "bg-belota-elevated text-belota-gold border border-belota-border"
                         : "text-belota-muted hover:text-belota-text hover:bg-belota-elevated/60"}`}>
                <Icon className="w-4 h-4" /> {it.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-belota-border">
          <div className="px-3 py-2 mb-2">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="overline">{ROLE_LABEL[user?.role] || user?.role}</div>
          </div>
          <button data-testid="logout-btn" onClick={() => { logout(); nav("/login"); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-sm text-sm text-belota-muted hover:text-belota-text hover:bg-belota-elevated transition-colors">
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </aside>
      <div className="flex-1 ml-64">
        <header className="h-14 bg-belota-surface border-b border-belota-border flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-2 text-belota-muted text-sm">
            <ShieldCheck className="w-4 h-4 text-belota-gold" />
            <span className="font-heading text-belota-text">Enterprise Governance Operating System</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-belota-muted">BELOTA GRC Framework™</span>
            <Shield className="w-6 h-6" />
          </div>
        </header>
        <main className="p-6 lg:p-8 max-w-[1400px] animate-fade-up">{children}</main>
      </div>
    </div>
  );
}
