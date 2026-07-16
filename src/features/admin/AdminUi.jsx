import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, LogOut } from "lucide-react";
import { logoutAdmin } from "@/lib/adminAuth";
import { SITE_NAME } from "@/lib/catalog";
import { BRAND_LOGO } from "@/lib/brand";

export function AdminHeader({ testTelegram, saving }) {
  return (
    <div className="border-b border-white/10 sticky top-0 z-40 bg-[#0D0D0D]/90 backdrop-blur-md">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={BRAND_LOGO} alt={SITE_NAME} className="h-11 w-auto object-contain" />
          <span className="font-bold text-lg">{SITE_NAME} <span className="text-white/40 font-normal hidden sm:inline">/ Admin</span></span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={testTelegram} disabled={saving} className="hidden sm:flex px-4 py-2 bg-[#168A55] rounded-xl text-sm font-semibold disabled:opacity-50 items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Telegram
          </button>
          <Link to="/" className="text-sm text-white/60 hover:text-[#FF6B35] transition flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Site
          </Link>
          <button onClick={() => logoutAdmin().then(() => { window.location.href = "/admin/login"; })} className="text-sm text-white/60 hover:text-[#FF6B35] transition flex items-center gap-1">
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </div>
    </div>
  );
}

export function Panel({ title, icon: Icon, children }) {
  return (
    <section className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-[#FF6B35]" />
        <h2 className="font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function AdminNavButton({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${active ? "bg-[#FF6B35] text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}>
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-white/50 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function AdminQuickLine({ label, value, tone = "text-white" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/45">{label}</span>
      <span className={`font-semibold ${tone}`}>{value}</span>
    </div>
  );
}

export function LoadingBlock() {
  return <div className="h-full min-h-28 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-white/35" /></div>;
}

export function EmptyBlock({ label }) {
  return <div className="min-h-28 flex items-center justify-center text-center text-white/35 text-sm">{label}</div>;
}

export const inputCls = "w-full min-h-10 px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#FF6B35]/50 focus:ring-2 focus:ring-[#FF6B35]/15";

