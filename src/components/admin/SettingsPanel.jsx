import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Save, Loader2, Check, Palette, MessageCircle, Send, Sliders, Eye, EyeOff } from "lucide-react";

export default function SettingsPanel() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const load = () => {
    base44.entities.Settings.list()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  const handleChange = (id, value) => {
    setSettings((prev) => prev.map((s) => (s.id === id ? { ...s, value } : s)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.Settings.bulkUpdate(settings.map((s) => ({ id: s.id, value: s.value })));
      // Apply colors immediately
      settings.forEach((s) => {
        if (s.key === "primary_color") document.documentElement.style.setProperty("--brand-primary", s.value);
        if (s.key === "primary_color_dark") document.documentElement.style.setProperty("--brand-primary-dark", s.value);
      });
      showToast("Configurações salvas!");
    } catch (e) { showToast("Erro ao salvar"); }
    setSaving(false);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-white/20 animate-spin" /></div>;
  }

  const grouped = {};
  settings.forEach((s) => {
    const cat = s.category || "outros";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  });

  const categoryMeta = {
    visual: { label: "Identidade visual", icon: Palette, desc: "Cores e nome do site" },
    channels: { label: "Canais", icon: MessageCircle, desc: "Links do WhatsApp e Telegram" },
    system: { label: "Funcionamento do sistema", icon: Sliders, desc: "Preferências de operação" },
  };

  const renderInput = (s) => {
    if (s.key.includes("color")) {
      return (
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={s.value || "#FF6B35"}
            onChange={(e) => handleChange(s.id, e.target.value)}
            className="w-12 h-12 rounded-xl bg-transparent border border-white/10 cursor-pointer"
          />
          <input
            type="text"
            value={s.value || ""}
            onChange={(e) => handleChange(s.id, e.target.value)}
            className="flex-1 px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-[#FF6B35]/50"
          />
        </div>
      );
    }
    if (s.key.includes("link") || s.key.includes("url")) {
      return <input type="url" value={s.value || ""} onChange={(e) => handleChange(s.id, e.target.value)} className={inputCls} />;
    }
    if (s.key.includes("max") || s.key.includes("hours") || s.key.includes("_count")) {
      return <input type="number" value={s.value || "0"} onChange={(e) => handleChange(s.id, e.target.value)} className={`${inputCls} font-mono`} />;
    }
    return <input type="text" value={s.value || ""} onChange={(e) => handleChange(s.id, e.target.value)} className={inputCls} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Configurações</h2>
          <p className="text-white/40 text-sm">Personalize a identidade visual, canais e funcionamento</p>
        </div>
        <button disabled={saving} onClick={handleSave} className="px-5 py-2.5 bg-[#FF6B35] hover:bg-[#D95426] text-white font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar configurações
        </button>
      </div>

      {/* Live preview banner */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <p className="text-white/40 text-xs uppercase tracking-wide mb-3">Pré-visualização</p>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: getSetting(settings, "primary_color", "#FF6B35") }}>
            <Send className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-white">{getSetting(settings, "site_name", "Achado Certo")}</p>
            <p className="text-white/40 text-xs">Identidade visual do site</p>
          </div>
          <span className="px-4 py-2 rounded-full text-white text-sm font-semibold" style={{ background: getSetting(settings, "primary_color", "#FF6B35") }}>
            Ver oferta
          </span>
        </div>
      </div>

      {Object.entries(grouped).map(([cat, items]) => {
        const meta = categoryMeta[cat] || { label: cat, icon: Sliders, desc: "" };
        return (
          <div key={cat} className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
              <meta.icon className="w-5 h-5 text-[#FF6B35]" /> {meta.label}
            </h3>
            {meta.desc && <p className="text-white/40 text-sm mb-5">{meta.desc}</p>}
            <div className="space-y-4">
              {items.map((s) => (
                <div key={s.id}>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">{s.label || s.key}</label>
                  {renderInput(s)}
                  {s.key === "whatsapp_link" && s.value && (
                    <a href={s.value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#168A55] text-xs mt-1.5 hover:underline">
                      <Eye className="w-3 h-3" /> Testar link
                    </a>
                  )}
                  {s.key === "telegram_link" && s.value && (
                    <a href={s.value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#168A55] text-xs mt-1.5 hover:underline">
                      <Eye className="w-3 h-3" /> Testar link
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 bg-white text-[#111111] rounded-xl text-sm font-medium shadow-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-[#168A55]" /> {toast}
        </div>
      )}
    </div>
  );
}

function getSetting(list, key, fallback) {
  const s = list.find((x) => x.key === key);
  return s?.value || fallback;
}

const inputCls = "w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#FF6B35]/50";