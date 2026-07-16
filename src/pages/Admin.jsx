import { Link } from "react-router-dom";
import { ArrowLeft, LogOut, Send, Zap } from "lucide-react";
import { SITE_NAME } from "@/lib/catalog";
import { logoutAdmin } from "@/lib/adminAuth";

export default function Admin() {
  return (
    <div className="bg-[#0D0D0D] min-h-screen text-white">
      <div className="border-b border-white/10 sticky top-0 z-50 bg-[#0D0D0D]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#FF6B35]" fill="currentColor" />
            </div>
            <span className="font-bold text-lg">{SITE_NAME} <span className="text-white/40 font-normal hidden sm:inline">· Painel administrativo</span></span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-white/60 hover:text-[#FF6B35] transition flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Ver site</span>
            </Link>
            <button onClick={() => logoutAdmin().then(() => { window.location.href = "/admin/login"; })} className="text-sm text-white/60 hover:text-[#FF6B35] transition flex items-center gap-1">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </div>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold mb-3">Administração</h1>
        <p className="text-white/45 mb-8">Gerencie as ofertas do Tá Barato em nosso sistema próprio.</p>
        <Link to="/admin/ofertas" className="block bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/[0.08] transition">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#FF6B35] rounded-xl flex items-center justify-center">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-xl">Ofertas Telegram</h2>
              <p className="text-white/45 text-sm">Cadastrar, publicar, agendar e reenviar ofertas.</p>
            </div>
          </div>
        </Link>
      </main>
    </div>
  );
}
