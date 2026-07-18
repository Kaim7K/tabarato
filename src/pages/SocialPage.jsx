import { useEffect, useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";
import { SocialEditor } from "@/features/social/SocialEditor";
import { SocialPagePreview } from "@/features/social/SocialPagePreview";
import { DEFAULT_PAGE_SETTINGS, DEFAULT_STYLE, EMPTY_LINK, mergeLinkDefaults, toApiDate } from "@/features/social/socialConfig";
import { isAdminLoggedIn, validateAdminSession } from "@/lib/adminAuth";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";
import "@/features/social/social.css";

async function request(path = "", options = {}) {
  const response = await fetch(`/api/ofertas?resource=social${path}`, {
    method: options.method || "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível atualizar a página.");
  return data;
}

function isCurrentlyVisible(link) {
  const now = Date.now();
  return link.isActive && (!link.startsAt || new Date(link.startsAt).getTime() <= now) && (!link.endsAt || new Date(link.endsAt).getTime() > now);
}

function prepareLink(link) {
  return { ...link, startsAt: toApiDate(link.startsAt), endsAt: toApiDate(link.endsAt) };
}

export default function SocialPage() {
  useDocumentMetadata("Links | Tá Barato", "Escolha onde receber os melhores achadinhos do Tá Barato.");
  const [page, setPage] = useState({ settings: DEFAULT_PAGE_SETTINGS, links: [] });
  const [admin, setAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [previewMode, setPreviewMode] = useState("mobile");
  const [linkForm, setLinkForm] = useState({ ...EMPTY_LINK, style: { ...DEFAULT_STYLE } });
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    request("", { signal: controller.signal }).then((data) => setPage({ settings: { ...DEFAULT_PAGE_SETTINGS, ...data.settings }, links: data.links.map(mergeLinkDefaults) })).catch((error) => { if (error.name !== "AbortError") setMessage(error.message); }).finally(() => setBusy(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isAdminLoggedIn()) return;
    validateAdminSession().then(setAdmin).catch(() => setAdmin(false));
  }, []);

  const updateFromServer = (data) => setPage({ settings: { ...DEFAULT_PAGE_SETTINGS, ...data.settings }, links: data.links.map(mergeLinkDefaults) });
  const run = async (action, successMessage) => {
    setBusy(true);
    setMessage("");
    try {
      updateFromServer(await action());
      if (successMessage) setMessage(successMessage);
      return true;
    } catch (error) {
      setMessage(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = () => run(() => request("", { method: "PUT", body: page.settings }), "Página atualizada.");
  const saveLink = async () => {
    const method = linkForm.id ? "PATCH" : "POST";
    const saved = await run(() => request("", { method, body: prepareLink({ ...linkForm, sortOrder: linkForm.sortOrder ?? page.links.length }) }), linkForm.id ? "Item atualizado." : "Item adicionado.");
    if (saved) setLinkForm({ ...EMPTY_LINK, style: { ...DEFAULT_STYLE }, sortOrder: page.links.length + 1 });
  };
  const removeLink = (id) => run(() => request(`&id=${encodeURIComponent(id)}`, { method: "DELETE" }), "Item removido.");
  const duplicateLink = (item) => run(() => request("", { method: "POST", body: prepareLink({ ...item, id: "", label: `${item.label} - cópia`, sortOrder: page.links.length, isPrimary: false }) }), "Cópia criada.");
  const reorderLinks = async (links) => {
    const previous = page.links;
    setPage((current) => ({ ...current, links }));
    const saved = await run(() => request("", { method: "PATCH", body: { action: "reorder", order: links.map(({ id }) => ({ id })) } }), "Ordem atualizada.");
    if (!saved) setPage((current) => ({ ...current, links: previous }));
  };

  const previewPage = useMemo(() => {
    if (!editing) return { ...page, links: page.links.filter(isCurrentlyVisible) };
    let links = page.links;
    if (linkForm.id) links = links.map((item) => item.id === linkForm.id ? linkForm : item);
    else if (linkForm.label) links = [...links, { ...linkForm, id: "draft-preview" }];
    return { ...page, links };
  }, [editing, linkForm, page]);

  if (busy && !page.links.length) return <div className="social-loading"><span />Carregando canais...</div>;

  return (
    <div className={editing ? "social-workspace" : ""}>
      {admin && !editing && <button type="button" className="social-edit-trigger" onClick={() => setEditing(true)} title="Editar árvore de links"><Pencil /> <span>Editar página</span></button>}
      {editing && <SocialEditor page={page} setPage={setPage} linkForm={linkForm} setLinkForm={setLinkForm} previewMode={previewMode} setPreviewMode={setPreviewMode} onClose={() => setEditing(false)} onSaveSettings={saveSettings} onSaveLink={saveLink} onDelete={removeLink} onDuplicate={duplicateLink} onReorder={reorderLinks} busy={busy} message={message} />}
      <div className={editing ? `social-preview-stage social-preview-stage--${previewMode}` : ""}>
        {editing && <div className="social-preview-stage__bar"><span>{previewMode === "mobile" ? "Prévia no celular" : "Prévia no desktop"}</span><button type="button" onClick={() => setEditing(false)} aria-label="Fechar editor"><X /></button></div>}
        <SocialPagePreview page={previewPage} preview={editing} />
      </div>
    </div>
  );
}
