import { useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clipboard, ExternalLink, Loader2, Plus, Save, Send, Sparkles, Tag } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { StoreBadge, TelegramIcon, WhatsAppIcon } from "@/components/BrandIcons";
import { formatTelegramPreview, formatWhatsAppPreview } from "@/lib/telegramOffersApi";
import { Field, inputCls, Panel } from "@/features/admin/AdminUi";
import { number } from "@/features/admin/adminOfferConfig";

export function EditorView({ form, selected, categories, saving, autoFilling, set, startNew, autoFillFromLink, openBrowserCapture, importBrowserCapture, save, publishNow, schedule }) {
  const [previewChannel, setPreviewChannel] = useState("site");
  const completion = [
    form.affiliateLink,
    form.productName,
    form.currentPrice,
    form.category,
    form.imageUrl,
  ].filter(Boolean).length;
  const completionPct = Math.round((completion / 5) * 100);
  const reviewItems = [
    !form.imageUrl && "Adicione uma imagem válida.",
    form.previousPrice && number(form.previousPrice) <= number(form.currentPrice) && "O preço anterior deve ser maior que o atual.",
    form.platform === "Mercado Livre" && form.affiliateLink && !/^https:\/\/meli\.la\//i.test(form.affiliateLink) && "Confirme o link afiliado meli.la.",
    form.coupon && /^(?:CUPONS?|\d+% OFF)$/i.test(form.coupon) && "Revise o código do cupom.",
  ].filter(Boolean);

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-white/45 text-sm">Cadastro de oferta</p>
            <h1 className="text-3xl font-bold mt-1">{selected ? "Editar oferta" : "Nova oferta"}</h1>
          </div>
          <button onClick={startNew} className="px-4 py-2.5 bg-white/10 rounded-lg font-semibold flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Limpar</button>
        </div>

        <Panel title="1. Link e preenchimento" icon={Sparkles}>
          <Field label="Link oficial de afiliado *">
            <div className="grid sm:grid-cols-[1fr_auto] gap-2">
              <input value={form.affiliateLink} onChange={(e) => set("affiliateLink", e.target.value)} className={inputCls} placeholder="https://..." />
              <button type="button" onClick={autoFillFromLink} disabled={autoFilling || !form.affiliateLink} className="px-4 py-2.5 bg-white text-[#0D0D0D] rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                {autoFilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Servidor
              </button>
            </div>
          </Field>
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            <button type="button" onClick={openBrowserCapture} disabled={!form.affiliateLink} className="px-4 py-2.5 bg-white/10 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              <ExternalLink className="w-4 h-4" />
              Abrir e copiar script
            </button>
            <button type="button" onClick={importBrowserCapture} className="px-4 py-2.5 bg-[#168A55] rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
              <Clipboard className="w-4 h-4" />
              Importar captura
            </button>
          </div>
          <p className="mt-3 text-xs text-white/35">Para lojas que bloqueiam servidor, abra o produto, cole o script no console da pagina e volte para importar.</p>
        </Panel>

        <Panel title="2. Dados do produto" icon={Tag}>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nome do produto *"><input value={form.productName} onChange={(e) => set("productName", e.target.value)} className={inputCls} /></Field>
            <Field label="Plataforma *">
              <select value={form.platform} onChange={(e) => set("platform", e.target.value)} className={inputCls}>
                <option>Mercado Livre</option>
                <option>Shopee</option>
                <option>Amazon</option>
                <option>Outra</option>
              </select>
            </Field>
            <Field label="Campanha"><input value={form.campaignName || ""} onChange={(e) => set("campaignName", e.target.value)} className={inputCls} placeholder="Ex.: Achadinhos da noite" /></Field>
            <Field label="Prioridade">
              <select value={form.priority || 0} onChange={(e) => set("priority", e.target.value)} className={inputCls}>
                <option value="-5">Baixa</option><option value="0">Normal</option><option value="5">Alta</option><option value="10">Urgente</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Descricao curta"><textarea value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} rows={3} className={`${inputCls} resize-none`} /></Field>
            </div>
            <Field label="Categoria *">
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
                {categories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Cupom"><input value={form.coupon} onChange={(e) => set("coupon", e.target.value)} className={inputCls} /></Field>
            <Field label="Desconto do cupom (%)"><input type="number" min="0" max="100" step="0.01" value={form.couponDiscountPercent || ""} onChange={(e) => set("couponDiscountPercent", e.target.value)} className={inputCls} /></Field>
            <Field label="Preco atual *"><input type="number" step="0.01" value={form.currentPrice} onChange={(e) => set("currentPrice", e.target.value)} className={inputCls} /></Field>
            <Field label="Preco anterior"><input type="number" step="0.01" value={form.previousPrice} onChange={(e) => set("previousPrice", e.target.value)} className={inputCls} /></Field>
            <div className="md:col-span-2">
              <Field label="URL da imagem"><input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} className={inputCls} placeholder="https://..." /></Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Texto complementar"><textarea value={form.extraText} onChange={(e) => set("extraText", e.target.value)} rows={2} className={`${inputCls} resize-none`} /></Field>
            </div>
          </div>
        </Panel>

        <Panel title="3. Publicacao" icon={Send}>
          <div className="grid md:grid-cols-[1fr_auto] gap-4 md:items-end">
            <Field label="Data e horario do agendamento"><input type="datetime-local" value={form.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} className={inputCls} /></Field>
            <div className="flex flex-wrap gap-2">
              <button disabled={saving} onClick={() => save({ status: "RASCUNHO" })} className="px-4 py-2.5 bg-white/10 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> Rascunho</button>
              <button disabled={saving} onClick={schedule} className="px-4 py-2.5 bg-blue-500 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"><CalendarClock className="w-4 h-4" /> Agendar</button>
              <button disabled={saving} onClick={publishNow} className="px-4 py-2.5 bg-[#FF6B35] rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"><Send className="w-4 h-4" /> Publicar</button>
            </div>
          </div>
        </Panel>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Panel title="Qualidade do cadastro" icon={CheckCircle2}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/50">Completude</span>
            <span className="text-sm font-semibold">{completionPct}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[#FF6B35]" style={{ width: `${completionPct}%` }} />
          </div>
          {reviewItems.length > 0 && <div className="mt-4 space-y-2">{reviewItems.map((item) => <p key={item} className="flex items-start gap-2 text-xs text-amber-200"><AlertTriangle className="w-4 h-4 shrink-0" />{item}</p>)}</div>}
        </Panel>
        <Panel title="Prévia por canal" icon={previewChannel === "telegram" ? TelegramIcon : previewChannel === "whatsapp" ? WhatsAppIcon : CheckCircle2}>
          <div className="grid grid-cols-3 gap-1 p-1 bg-white/5 rounded-lg mb-4">
            {[{ id: "site", label: "Site" }, { id: "telegram", label: "Telegram" }, { id: "whatsapp", label: "WhatsApp" }].map((channel) => <button key={channel.id} type="button" onClick={() => setPreviewChannel(channel.id)} className={`min-h-9 rounded-md text-xs font-semibold ${previewChannel === channel.id ? "bg-white text-[#111111]" : "text-white/55"}`}>{channel.label}</button>)}
          </div>
          {previewChannel === "site" && <OfferPreview form={form} />}
          {previewChannel === "telegram" && <pre className="text-xs text-white/70 whitespace-pre-wrap font-sans leading-relaxed">{formatTelegramPreview(form)}</pre>}
          {previewChannel === "whatsapp" && <pre className="text-xs text-white/70 whitespace-pre-wrap font-sans leading-relaxed">{formatWhatsAppPreview(form)}</pre>}
        </Panel>
      </div>
    </div>
  );
}

function OfferPreview({ form }) {
  const finalPrice = form.couponDiscountPercent > 0 ? number(form.currentPrice) * (1 - number(form.couponDiscountPercent) / 100) : 0;
  return (
    <div className="bg-white text-[#111111] rounded-lg overflow-hidden">
      <div className="relative aspect-[4/3] bg-white">
        {form.imageUrl && <img src={form.imageUrl} alt="" className="w-full h-full object-contain" />}
        <StoreBadge platform={form.platform} />
      </div>
      <div className="p-4">
        <p className="text-xs text-[#111111]/50 mb-1">{form.category || "Categoria"}</p>
        <h3 className="font-bold leading-snug">{form.productName || "Nome do produto"}</h3>
        <p className="text-sm text-[#111111]/60 mt-2 line-clamp-3">{form.shortDescription || "Descricao curta da oferta"}</p>
        <div className="mt-3 flex items-end gap-2">
          <p className="font-bold text-xl">{form.currentPrice ? formatPrice(number(form.currentPrice)) : "R$ 0,00"}</p>
          {form.previousPrice && <p className="text-sm text-[#111111]/35 line-through mb-0.5">{formatPrice(number(form.previousPrice))}</p>}
        </div>
        {finalPrice > 0 && <p className="mt-2 text-sm font-semibold text-[#168A55]">Com cupom: {formatPrice(finalPrice)}</p>}
      </div>
    </div>
  );
}
