import { useState } from "react";
import {
  Check, ChevronDown, Copy, GripVertical, ImagePlus, Laptop,
  Palette, Plus, RotateCcw, Save, Smartphone, Trash2, X,
} from "lucide-react";
import { SocialIcon } from "./SocialIcon";
import { imageFileToDataUrl } from "./socialImages";
import {
  DEFAULT_STYLE, EMPTY_LINK, ICON_OPTIONS, ITEM_TYPES, STYLE_TEMPLATES,
  mergeLinkDefaults, toDateTimeLocal,
} from "./socialConfig";

function Field({ label, children, wide = false }) {
  return <label className={`social-editor__field ${wide ? "social-editor__field--wide" : ""}`}><span>{label}</span>{children}</label>;
}

function ColorField({ label, value, fallback, onChange }) {
  return (
    <Field label={label}>
      <span className="social-editor__color">
        <input type="color" value={value || fallback} onChange={(event) => onChange(event.target.value)} />
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Padrão" maxLength={7} />
      </span>
    </Field>
  );
}

function UploadButton({ label, onChange }) {
  return (
    <label className="social-editor__upload">
      <ImagePlus aria-hidden="true" /> {label}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        try {
          input.setCustomValidity("");
          if (file) onChange(await imageFileToDataUrl(file));
        } catch (error) {
          input.setCustomValidity(error.message);
          input.reportValidity();
        } finally {
          input.value = "";
        }
      }} />
    </label>
  );
}

export function SocialEditor({
  page, setPage, linkForm, setLinkForm, previewMode, setPreviewMode,
  onClose, onSaveSettings, onSaveLink, onDelete, onDuplicate, onReorder, busy, message,
}) {
  const [draggedId, setDraggedId] = useState("");
  const [activeSection, setActiveSection] = useState("items");
  const settings = page.settings;
  const updateSettings = (values) => setPage((current) => ({ ...current, settings: { ...current.settings, ...values } }));
  const updateLink = (values) => setLinkForm((current) => ({ ...current, ...values }));
  const updateStyle = (values) => setLinkForm((current) => ({ ...current, style: { ...DEFAULT_STYLE, ...current.style, ...values } }));
  const startNew = () => setLinkForm({ ...EMPTY_LINK, style: { ...DEFAULT_STYLE }, sortOrder: page.links.length });

  const applyTemplate = (key) => {
    const template = STYLE_TEMPLATES[key];
    const values = { ...template };
    const itemLabel = values.itemLabel;
    delete values.name;
    delete values.itemLabel;
    setLinkForm((current) => mergeLinkDefaults({ ...current, ...values, label: current.label || itemLabel || "", style: template.style }));
  };

  const moveItem = (targetId) => {
    if (!draggedId || draggedId === targetId) return;
    const next = [...page.links];
    const sourceIndex = next.findIndex((item) => item.id === draggedId);
    const targetIndex = next.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDraggedId("");
    onReorder(next);
  };

  return (
    <aside className="social-editor" aria-label="Editor da árvore de links">
      <header className="social-editor__header">
        <div><span>EDITOR SOCIAL</span><strong>Personalização</strong></div>
        <button type="button" onClick={onClose} title="Fechar editor" aria-label="Fechar editor"><X /></button>
      </header>

      <div className="social-editor__tabs" role="tablist" aria-label="Áreas de edição">
        <button type="button" className={activeSection === "items" ? "is-active" : ""} onClick={() => setActiveSection("items")}>Itens</button>
        <button type="button" className={activeSection === "page" ? "is-active" : ""} onClick={() => setActiveSection("page")}>Página</button>
        <span className="social-editor__devices">
          <button type="button" className={previewMode === "mobile" ? "is-active" : ""} onClick={() => setPreviewMode("mobile")} title="Prévia no celular" aria-label="Prévia no celular"><Smartphone /></button>
          <button type="button" className={previewMode === "desktop" ? "is-active" : ""} onClick={() => setPreviewMode("desktop")} title="Prévia no desktop" aria-label="Prévia no desktop"><Laptop /></button>
        </span>
      </div>

      <div className="social-editor__scroll">
        {activeSection === "page" ? (
          <section className="social-editor__section" aria-label="Identidade da página">
            <div className="social-editor__section-title"><Palette /><div><strong>Identidade da página</strong><span>Cabeçalho e atmosfera visual</span></div></div>
            <div className="social-editor__grid">
              <Field label="Assinatura" wide><input value={settings.eyebrow} onChange={(event) => updateSettings({ eyebrow: event.target.value })} /></Field>
              <Field label="Título" wide><input value={settings.title} onChange={(event) => updateSettings({ title: event.target.value })} /></Field>
              <Field label="Descrição" wide><textarea rows={3} value={settings.bio} onChange={(event) => updateSettings({ bio: event.target.value })} /></Field>
              <Field label="URL da logo" wide><input value={settings.avatarUrl} onChange={(event) => updateSettings({ avatarUrl: event.target.value })} placeholder="https://..." /></Field>
              <UploadButton label="Enviar logo" onChange={(avatarUrl) => updateSettings({ avatarUrl })} />
              <UploadButton label="Enviar personagem" onChange={(mascotUrl) => updateSettings({ mascotUrl })} />
              <Field label="URL do personagem" wide><input value={settings.mascotUrl} onChange={(event) => updateSettings({ mascotUrl: event.target.value })} placeholder="https://..." /></Field>
              <Field label="Imagem de fundo" wide><input value={settings.backgroundImageUrl} onChange={(event) => updateSettings({ backgroundImageUrl: event.target.value })} placeholder="https://..." /></Field>
              <UploadButton label="Enviar fundo" onChange={(backgroundImageUrl) => updateSettings({ backgroundImageUrl })} />
              <ColorField label="Laranja" value={settings.accentColor} fallback="#FF5A1F" onChange={(accentColor) => updateSettings({ accentColor })} />
              <ColorField label="Verde" value={settings.secondaryColor} fallback="#16A34A" onChange={(secondaryColor) => updateSettings({ secondaryColor })} />
              <ColorField label="Fundo" value={settings.backgroundColor} fallback="#FFF9F5" onChange={(backgroundColor) => updateSettings({ backgroundColor })} />
            </div>
            <button type="button" className="social-editor__primary" disabled={busy} onClick={onSaveSettings}><Save /> Salvar página</button>
          </section>
        ) : (
          <>
            <section className="social-editor__section" aria-label="Itens cadastrados">
              <div className="social-editor__section-head"><div><strong>Itens publicados</strong><span>Arraste para reorganizar</span></div><button type="button" onClick={startNew} title="Novo item"><Plus /> Novo</button></div>
              <div className="social-editor__list">
                {page.links.map((item) => (
                  <div key={item.id} draggable onDragStart={() => setDraggedId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveItem(item.id)} className={`social-editor__list-item ${linkForm.id === item.id ? "is-active" : ""}`}>
                    <GripVertical className="social-editor__drag" />
                    <button type="button" className="social-editor__list-main" onClick={() => setLinkForm(mergeLinkDefaults({ ...item, startsAt: toDateTimeLocal(item.startsAt), endsAt: toDateTimeLocal(item.endsAt) }))}>
                      <SocialIcon name={item.iconName} /><span><strong>{item.label}</strong><small>{ITEM_TYPES.find(([value]) => value === item.itemType)?.[1]}</small></span>
                    </button>
                    <span className={`social-editor__status ${item.isActive ? "is-live" : ""}`} title={item.isActive ? "Publicado" : "Oculto"} />
                    <button type="button" onClick={() => onDuplicate(item)} title="Duplicar" aria-label={`Duplicar ${item.label}`}><Copy /></button>
                    <button type="button" onClick={() => onDelete(item.id)} title="Excluir" aria-label={`Excluir ${item.label}`}><Trash2 /></button>
                  </div>
                ))}
                {!page.links.length && <p className="social-editor__empty">Adicione o primeiro canal ou chamada.</p>}
              </div>
            </section>

            <section className="social-editor__section social-editor__form" aria-label="Configurar item">
              <div className="social-editor__section-head"><div><strong>{linkForm.id ? "Editar item" : "Novo item"}</strong><span>A prévia muda em tempo real</span></div></div>

              <div className="social-editor__templates">
                {Object.entries(STYLE_TEMPLATES).map(([key, template]) => <button key={key} type="button" onClick={() => applyTemplate(key)}>{template.name}</button>)}
              </div>

              <div className="social-editor__grid">
                <Field label="Tipo" wide><select value={linkForm.itemType} onChange={(event) => updateLink({ itemType: event.target.value })}>{ITEM_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Título" wide><input value={linkForm.label} onChange={(event) => updateLink({ label: event.target.value })} placeholder="Ex.: Entrar no Telegram" /></Field>
                <Field label="Subtítulo" wide><input value={linkForm.subtitle} onChange={(event) => updateLink({ subtitle: event.target.value })} placeholder="Opcional" /></Field>
                <Field label="URL" wide><input value={linkForm.url} onChange={(event) => updateLink({ url: event.target.value })} placeholder="https://..." /></Field>
                <label className="social-editor__toggle social-editor__field--wide"><input type="checkbox" checked={linkForm.isActive} onChange={(event) => updateLink({ isActive: event.target.checked })} /><span>Exibir na página pública</span></label>
                <Field label="Badge"><input value={linkForm.badge} onChange={(event) => updateLink({ badge: event.target.value })} placeholder="Novo" /></Field>
                <Field label="Tamanho"><select value={linkForm.style.size} onChange={(event) => updateStyle({ size: event.target.value })}><option value="compact">Compacto</option><option value="default">Padrão</option><option value="large">Grande</option></select></Field>
              </div>

              <details open className="social-editor__details"><summary>Ícone e imagens <ChevronDown /></summary><div className="social-editor__details-content">
                <div className="social-editor__icons">{ICON_OPTIONS.map(([value, label]) => <button key={value} type="button" className={linkForm.iconName === value ? "is-active" : ""} onClick={() => updateLink({ iconName: value })} title={label}><SocialIcon name={value} /><span>{label}</span></button>)}</div>
                <div className="social-editor__grid">
                  <Field label="URL do ícone" wide><input value={linkForm.iconUrl} onChange={(event) => updateLink({ iconUrl: event.target.value })} placeholder="Opcional" /></Field>
                  <UploadButton label="Enviar ícone" onChange={(iconUrl) => updateLink({ iconUrl })} />
                  <Field label="URL da imagem" wide><input value={linkForm.imageUrl} onChange={(event) => updateLink({ imageUrl: event.target.value })} placeholder="Para card com imagem" /></Field>
                  <UploadButton label="Enviar imagem" onChange={(imageUrl) => updateLink({ imageUrl })} />
                  <Field label="Imagem de fundo" wide><input value={linkForm.backgroundImageUrl} onChange={(event) => updateLink({ backgroundImageUrl: event.target.value })} placeholder="Para banner" /></Field>
                  <UploadButton label="Enviar fundo" onChange={(backgroundImageUrl) => updateLink({ backgroundImageUrl })} />
                </div>
              </div></details>

              <details className="social-editor__details"><summary>Cores e acabamento <ChevronDown /></summary><div className="social-editor__details-content social-editor__grid">
                <ColorField label="Fundo" value={linkForm.style.backgroundColor} fallback="#FFFFFF" onChange={(backgroundColor) => updateStyle({ backgroundColor })} />
                <ColorField label="Texto" value={linkForm.style.textColor} fallback="#171717" onChange={(textColor) => updateStyle({ textColor })} />
                <ColorField label="Ícone" value={linkForm.style.iconColor} fallback="#FF5A1F" onChange={(iconColor) => updateStyle({ iconColor })} />
                <ColorField label="Borda" value={linkForm.style.borderColor} fallback="#E8E1DB" onChange={(borderColor) => updateStyle({ borderColor })} />
                <ColorField label="Seta" value={linkForm.style.arrowColor} fallback="#FF5A1F" onChange={(arrowColor) => updateStyle({ arrowColor })} />
                <Field label="Sombra"><select value={linkForm.style.shadow} onChange={(event) => updateStyle({ shadow: event.target.value })}><option value="none">Sem sombra</option><option value="soft">Suave</option><option value="medium">Média</option><option value="strong">Forte</option></select></Field>
                <Field label={`Arredondamento: ${linkForm.style.borderRadius}px`} wide><input type="range" min="8" max="40" value={linkForm.style.borderRadius} onChange={(event) => updateStyle({ borderRadius: Number(event.target.value) })} /></Field>
                <label className="social-editor__toggle social-editor__field--wide"><input type="checkbox" checked={linkForm.style.gradientEnabled} onChange={(event) => updateStyle({ gradientEnabled: event.target.checked })} /><span>Usar gradiente</span></label>
                {linkForm.style.gradientEnabled && <><ColorField label="Início" value={linkForm.style.gradientStart} fallback="#FF6A1A" onChange={(gradientStart) => updateStyle({ gradientStart })} /><ColorField label="Fim" value={linkForm.style.gradientEnd} fallback="#FF3D00" onChange={(gradientEnd) => updateStyle({ gradientEnd })} /></>}
              </div></details>

              <details className="social-editor__details"><summary>Layout e movimento <ChevronDown /></summary><div className="social-editor__details-content social-editor__grid">
                <Field label="Alinhamento"><select value={linkForm.style.alignment} onChange={(event) => updateStyle({ alignment: event.target.value })}><option value="left">À esquerda</option><option value="center">Centralizado</option></select></Field>
                <Field label="Estilo do ícone"><select value={linkForm.style.iconStyle} onChange={(event) => updateStyle({ iconStyle: event.target.value })}><option value="plain">Simples</option><option value="soft">Suave</option><option value="solid">Sólido</option><option value="circle">Circular</option></select></Field>
                <Field label="Entrada"><select value={linkForm.style.entryAnimation} onChange={(event) => updateStyle({ entryAnimation: event.target.value })}><option value="none">Nenhuma</option><option value="fade">Aparecer</option><option value="slide">Deslizar</option><option value="pop">Expandir</option></select></Field>
                <Field label="Ao passar"><select value={linkForm.style.hoverEffect} onChange={(event) => updateStyle({ hoverEffect: event.target.value })}><option value="none">Nenhum</option><option value="lift">Elevar</option><option value="scale">Ampliar</option><option value="glow">Brilhar</option></select></Field>
              </div></details>

              <details className="social-editor__details"><summary>Publicação <ChevronDown /></summary><div className="social-editor__details-content social-editor__grid">
                <Field label="Iniciar em"><input type="datetime-local" value={linkForm.startsAt || ""} onChange={(event) => updateLink({ startsAt: event.target.value })} /></Field>
                <Field label="Encerrar em"><input type="datetime-local" value={linkForm.endsAt || ""} onChange={(event) => updateLink({ endsAt: event.target.value })} /></Field>
                <label className="social-editor__toggle"><input type="checkbox" checked={linkForm.openNewTab} onChange={(event) => updateLink({ openNewTab: event.target.checked })} /><span>Abrir em nova guia</span></label>
                <label className="social-editor__toggle"><input type="checkbox" checked={linkForm.isPrimary} onChange={(event) => updateLink({ isPrimary: event.target.checked })} /><span>Marcar como principal</span></label>
              </div></details>

              <div className="social-editor__form-actions">
                <button type="button" onClick={() => updateStyle({ ...DEFAULT_STYLE })} title="Restaurar estilo"><RotateCcw /> Restaurar</button>
                <button type="button" className="social-editor__primary" disabled={busy || !linkForm.label} onClick={onSaveLink}>{linkForm.id ? <Check /> : <Plus />} {linkForm.id ? "Atualizar item" : "Adicionar item"}</button>
              </div>
            </section>
          </>
        )}
        {message && <p className="social-editor__message" role="status">{message}</p>}
      </div>
    </aside>
  );
}
