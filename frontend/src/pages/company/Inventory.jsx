import React, { useState } from "react";
import CrudSection from "../../components/CrudSection";
import { Badge } from "../../components/ui-belota";
import { Database, Server, Boxes, Truck } from "lucide-react";

const TYPES = [
  { key: "data", label: "Dados", icon: Database, cat: "Categoria de dado" },
  { key: "systems", label: "Sistemas", icon: Server, cat: "Tipo de sistema" },
  { key: "assets", label: "Ativos", icon: Boxes, cat: "Tipo de ativo" },
  { key: "vendors", label: "Fornecedores", icon: Truck, cat: "Categoria" },
];

const SENS = [
  { value: "normal", label: "Normal" },
  { value: "pessoal", label: "Dado Pessoal" },
  { value: "sensivel", label: "Dado Sensível" },
  { value: "critico", label: "Crítico" },
];

export default function Inventory({ companyId, canCreate }) {
  const [type, setType] = useState("data");
  const t = TYPES.find((x) => x.key === type);

  return (
    <div>
      <div className="overline mb-1">Inventários Corporativos</div>
      <h2 className="font-heading text-xl font-semibold mb-4">Inventário de {t.label}</h2>
      <div className="flex gap-2 mb-6 flex-wrap">
        {TYPES.map((x) => {
          const Icon = x.icon;
          return (
            <button key={x.key} data-testid={`inv-type-${x.key}`} onClick={() => setType(x.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-sm text-sm border transition-colors ${
                type === x.key ? "bg-belota-elevated border-belota-gold/40 text-belota-gold" : "border-belota-border text-belota-muted hover:text-belota-text"}`}>
              <Icon className="w-4 h-4" /> {x.label}
            </button>
          );
        })}
      </div>

      <CrudSection key={type} companyId={companyId} path="inventory" canCreate={canCreate}
        extra={{ type }}
        overline={`Inventário · ${t.label}`} title=""
        config={{
          columns: [
            { key: "name", label: "Nome", render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "category", label: t.cat },
            { key: "sensitivity", label: "Sensibilidade", render: (r) => <Badge tone={r.sensitivity === "sensivel" || r.sensitivity === "critico" ? "high" : r.sensitivity === "pessoal" ? "gold" : "neutral"}>{r.sensitivity}</Badge> },
            { key: "owner", label: "Responsável" },
            { key: "location", label: "Localização" },
          ],
          fields: [
            { name: "name", label: "Nome", full: true, required: true },
            { name: "category", label: t.cat },
            { name: "sensitivity", label: "Sensibilidade", type: "select", options: SENS, default: "normal" },
            { name: "owner", label: "Responsável" },
            { name: "location", label: "Localização" },
            { name: "description", label: "Descrição", type: "textarea", full: true },
          ],
        }} />
    </div>
  );
}
