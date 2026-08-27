import React, { useEffect, useState } from "react";
import { api, fmtErr } from "../lib/api";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { EmptyState, Badge } from "./ui-belota";
import { Plus, Trash2, Sparkles, Loader2 } from "lucide-react";

// config: { columns:[{key,label,render?}], fields:[{name,label,type,options?,full?,default?}] }
export default function CrudSection({ companyId, path, overline, title, desc, config,
  canCreate = true, aiButton, extra = {}, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const url = `/companies/${companyId}/${path}`;

  const load = async () => {
    try {
      const { data } = await api.get(url);
      setItems(data);
    } catch (e) { toast.error(fmtErr(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId, path]);

  const openNew = () => {
    const init = {};
    config.fields.forEach((f) => { init[f.name] = f.default ?? (f.type === "checkbox" ? false : f.type === "number" ? 1 : ""); });
    setForm(init);
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, ...extra };
      config.fields.forEach((f) => { if (f.type === "number") payload[f.name] = Number(payload[f.name]); });
      await api.post(url, payload);
      toast.success("Registro adicionado");
      setOpen(false);
      await load();
      onChanged && onChanged();
    } catch (e) { toast.error(fmtErr(e)); } finally { setSaving(false); }
  };

  const del = async (id) => {
    try {
      await api.delete(`${url}/${id}`);
      setItems(items.filter((i) => i.id !== id));
      onChanged && onChanged();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          {overline && <div className="overline mb-1">{overline}</div>}
          <h2 className="font-heading text-xl font-semibold">{title}</h2>
          {desc && <p className="text-sm text-belota-muted mt-1 max-w-2xl">{desc}</p>}
        </div>
        <div className="flex gap-2">
          {aiButton}
          {canCreate && (
            <Button data-testid={`add-${path}-btn`} onClick={openNew}
              className="bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-belota-muted text-sm py-8">Carregando...</div>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum registro ainda" hint="Adicione o primeiro item para alimentar os demais módulos." />
      ) : (
        <div className="bg-belota-surface border border-belota-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-belota-border text-belota-muted">
                {config.columns.map((c) => (
                  <th key={c.key} className="text-left font-medium px-4 py-3 overline">{c.label}</th>
                ))}
                {canCreate && <th className="w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} data-testid={`${path}-row`} className="border-b border-belota-border/60 hover:bg-belota-elevated transition-colors">
                  {config.columns.map((c) => (
                    <td key={c.key} className="px-4 py-3 align-top">
                      {c.render ? c.render(it) : (it[c.key] ?? "—")}
                    </td>
                  ))}
                  {canCreate && (
                    <td className="px-4 py-3 text-right">
                      <button data-testid={`del-${path}-btn`} onClick={() => del(it.id)}
                        className="text-belota-muted hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-belota-surface border-belota-border text-belota-text max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin">
          <DialogHeader><DialogTitle className="font-heading">{title} — Novo</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {config.fields.map((f) => (
                <div key={f.name} className={f.full ? "col-span-2" : "col-span-2 sm:col-span-1"}>
                  <Label className="text-belota-muted">{f.label}</Label>
                  {f.type === "textarea" ? (
                    <Textarea value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      className="bg-belota-bg border-belota-border mt-1" />
                  ) : f.type === "select" ? (
                    <select value={form[f.name]} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      className="w-full mt-1 bg-belota-bg border border-belota-border rounded-sm h-10 px-3 text-sm">
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === "checkbox" ? (
                    <div className="mt-2">
                      <input type="checkbox" checked={!!form[f.name]}
                        onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })} className="accent-belota-gold w-4 h-4" />
                    </div>
                  ) : (
                    <Input type={f.type} value={form[f.name] ?? ""} required={f.required}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      className="bg-belota-bg border-belota-border mt-1" />
                  )}
                </div>
              ))}
            </div>
            <Button data-testid={`save-${path}-btn`} type="submit" disabled={saving}
              className="w-full bg-belota-gold text-belota-bg hover:bg-belota-goldlight rounded-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { Badge, Sparkles };
