import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Eye, EyeOff, GripVertical, ImagePlus, Link2, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { BRAND_FAVICON, BRAND_LOGO } from "@/lib/brand";
import { isAdminLoggedIn, validateAdminSession } from "@/lib/adminAuth";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

const emptyLink = { id: "", label: "", url: "", iconUrl: "", sortOrder: 0, isActive: true };

async function request(path = "", options = {}) {
  const response = await fetch(`/api/ofertas?resource=social${path}`, {
    method: options.method || "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Nao foi possivel atualizar a pagina.");
  return data;
}

const fileDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) return resolve("");
  if (file.size > 700_000) return reject(new Error("Use uma imagem de ate 700 KB."));
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
  reader.readAsDataURL(file);
});

export default function SocialPage() {
  useDocumentMetadata("Links | Ta Barato", "Todos os canais e links oficiais do Ta Barato.");
  const [page, setPage] = useState({ settings: { title: "Ta Barato", bio: "", avatarUrl: "", accentColor: "#FF6B35", backgroundColor: "#F4F5F6" }, links: [] });
  const [admin, setAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [linkForm, setLinkForm] = useState(emptyLink);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  const load = () => request().then(setPage).finally(() => setBusy(false));
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  useEffect(() => {
    if (!isAdminLoggedIn()) return;
    validateAdminSession().then(setAdmin).catch(() => setAdmin(false));
  }, []);

  const saveSettings = async () => {
    setBusy(true);
    try {
      setPage(await request("", { method: "PUT", body: page.settings }));
      setMessage("Personalizacao salva.");
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };

  const saveLink = async () => {
    setBusy(true);
    try {
      const method = linkForm.id ? "PATCH" : "POST";
      setPage(await request("", { method, body: { ...linkForm, sortOrder: linkForm.sortOrder || page.links.length } }));
      setLinkForm(emptyLink);
      setMessage("Link salvo.");
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };

  const removeLink = async (id) => {
    setBusy(true);
    try { setPage(await request(`&id=${encodeURIComponent(id)}`, { method: "DELETE" })); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };

  const settings = page.settings;
  const activeLinks = admin && editing ? page.links : page.links.filter((link) => link.isActive);
  return (
    <main className="min-h-screen px-4 py-8 sm:py-12" style={{ backgroundColor: settings.backgroundColor }}>
      <div className="mx-auto w-full max-w-md">
        {admin && (
          <button type="button" onClick={() => setEditing((value) => !value)} className="fixed right-4 top-4 z-20 min-h-11 min-w-11 inline-flex items-center justify-center rounded-md bg-[#111111] text-white shadow-lg" title={editing ? "Fechar edicao" : "Editar pagina"} aria-label={editing ? "Fechar edicao" : "Editar pagina"}>
            {editing ? <X className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
          </button>
        )}

        <header className="text-center px-5">
          <img src={settings.avatarUrl || BRAND_LOGO} onError={(event) => { event.currentTarget.src = BRAND_FAVICON; }} alt={settings.title} className="mx-auto h-24 w-24 rounded-full object-contain bg-white border border-black/10 p-2 shadow-sm" />
          <h1 className="mt-5 text-2xl font-bold text-[#111111]">{settings.title}</h1>
          {settings.bio && <p className="mt-2 text-sm leading-6 text-[#111111]/60">{settings.bio}</p>}
        </header>

        {editing && (
          <section className="mt-7 border-y border-black/10 py-5 space-y-4" aria-label="Personalizar pagina">
            <div className="grid gap-3">
              <input value={settings.title} onChange={(event) => setPage((current) => ({ ...current, settings: { ...current.settings, title: event.target.value } }))} placeholder="Titulo" className="min-h-11 rounded-md border border-black/15 bg-white px-3" />
              <textarea value={settings.bio} onChange={(event) => setPage((current) => ({ ...current, settings: { ...current.settings, bio: event.target.value } }))} placeholder="Bio curta" rows={3} className="rounded-md border border-black/15 bg-white px-3 py-2" />
              <input value={settings.avatarUrl} onChange={(event) => setPage((current) => ({ ...current, settings: { ...current.settings, avatarUrl: event.target.value } }))} placeholder="Link da foto ou logo" className="min-h-11 rounded-md border border-black/15 bg-white px-3" />
              <label className="min-h-11 inline-flex items-center justify-center gap-2 rounded-md border border-black/15 bg-white text-sm font-semibold cursor-pointer"><ImagePlus className="w-4 h-4" /> Enviar foto<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (event) => { const avatarUrl = await fileDataUrl(event.target.files?.[0]); setPage((current) => ({ ...current, settings: { ...current.settings, avatarUrl } })); }} /></label>
              <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-black/60">Cor principal<input type="color" value={settings.accentColor} onChange={(event) => setPage((current) => ({ ...current, settings: { ...current.settings, accentColor: event.target.value } }))} className="mt-1 h-11 w-full rounded-md border border-black/15 bg-white p-1" /></label><label className="text-xs font-semibold text-black/60">Fundo<input type="color" value={settings.backgroundColor} onChange={(event) => setPage((current) => ({ ...current, settings: { ...current.settings, backgroundColor: event.target.value } }))} className="mt-1 h-11 w-full rounded-md border border-black/15 bg-white p-1" /></label></div>
              <button type="button" onClick={saveSettings} className="min-h-11 inline-flex items-center justify-center gap-2 rounded-md bg-[#111111] text-white font-semibold"><Save className="w-4 h-4" /> Salvar aparencia</button>
            </div>
          </section>
        )}

        <section className="mt-7 space-y-3" aria-label="Links">
          {busy && !page.links.length ? <div className="flex justify-center py-12"><LoaderCircle className="w-6 h-6 animate-spin" /></div> : activeLinks.map((link) => (
            <div key={link.id} className="flex items-center gap-2">
              {editing && <GripVertical className="w-4 h-4 text-black/30 shrink-0" />}
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="group min-h-16 flex-1 flex items-center gap-3 rounded-lg border border-black/10 bg-white px-4 shadow-[0_5px_20px_rgba(17,17,17,.06)] transition hover:-translate-y-0.5 hover:shadow-md">
                <span className="h-10 w-10 shrink-0 rounded-md flex items-center justify-center" style={{ backgroundColor: `${settings.accentColor}18`, color: settings.accentColor }}>{link.iconUrl ? <img src={link.iconUrl} alt="" className="h-6 w-6 object-contain" /> : <Link2 className="w-5 h-5" />}</span>
                <strong className="min-w-0 flex-1 text-sm text-[#111111]">{link.label}</strong><ArrowUpRight className="w-4 h-4 text-black/35 group-hover:text-black" />
              </a>
              {editing && <><button type="button" onClick={() => setLinkForm(link)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md border border-black/10 bg-white" title="Editar link" aria-label="Editar link"><Pencil className="w-4 h-4" /></button><button type="button" onClick={() => removeLink(link.id)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md border border-red-200 bg-white text-red-600" title="Excluir link" aria-label="Excluir link"><Trash2 className="w-4 h-4" /></button></>}
            </div>
          ))}
        </section>

        {editing && (
          <section className="mt-5 border-t border-black/10 pt-5 space-y-3">
            <h2 className="text-sm font-bold">{linkForm.id ? "Editar link" : "Adicionar link"}</h2>
            <input value={linkForm.label} onChange={(event) => setLinkForm((current) => ({ ...current, label: event.target.value }))} placeholder="Nome do link" className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3" />
            <input value={linkForm.url} onChange={(event) => setLinkForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://..." type="url" className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3" />
            <input value={linkForm.iconUrl} onChange={(event) => setLinkForm((current) => ({ ...current, iconUrl: event.target.value }))} placeholder="Link do icone" className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3" />
            <div className="grid grid-cols-[1fr_auto] gap-2"><label className="min-h-11 inline-flex items-center justify-center gap-2 rounded-md border border-black/15 bg-white text-sm font-semibold cursor-pointer"><ImagePlus className="w-4 h-4" /> Enviar icone<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (event) => { const iconUrl = await fileDataUrl(event.target.files?.[0]); setLinkForm((current) => ({ ...current, iconUrl })); }} /></label><button type="button" onClick={() => setLinkForm((current) => ({ ...current, isActive: !current.isActive }))} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md border border-black/15 bg-white" title={linkForm.isActive ? "Link visivel" : "Link oculto"}>{linkForm.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button></div>
            <button type="button" disabled={busy} onClick={saveLink} className="min-h-12 w-full inline-flex items-center justify-center gap-2 rounded-md text-white font-bold" style={{ backgroundColor: settings.accentColor }}>{linkForm.id ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />} {linkForm.id ? "Atualizar link" : "Adicionar link"}</button>
          </section>
        )}
        {message && <p className="mt-5 text-center text-xs text-black/55" role="status">{message}</p>}
        <footer className="py-10 text-center text-xs text-black/35">Ta Barato</footer>
      </div>
    </main>
  );
}
