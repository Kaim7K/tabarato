import { Link } from "react-router-dom";
import { MessageCircle, Send } from "lucide-react";
import { SITE_NAME } from "@/lib/catalog";
import { TELEGRAM_CHANNEL_URL, WHATSAPP_GROUP_URL } from "@/lib/publicLinks";
import { BRAND_LOGO } from "@/lib/brand";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-[#111111]/10">
      <div id="grupo" className="bg-[#FF6B35] py-10 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-white/70 text-xs font-semibold uppercase mb-2">Não perca nenhum achado</p>
            <h2 className="text-white text-2xl sm:text-3xl font-semibold leading-tight">
              Receba os melhores achados diretamente no celular.
            </h2>
            <p className="text-white/80 text-sm sm:text-base mt-2">
              A gente filtra. Você encontra. Acompanhe nossos canais para receber ofertas selecionadas em primeira mão.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            {WHATSAPP_GROUP_URL && (
              <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noopener noreferrer" className="min-h-12 inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#168A55] text-white font-semibold rounded-md hover:bg-[#137247] transition">
                <MessageCircle className="w-5 h-5" /> Entrar no WhatsApp
              </a>
            )}
            {TELEGRAM_CHANNEL_URL && (
              <a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="min-h-12 inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-[#111111] font-semibold rounded-md hover:bg-[#F3F3F3] transition">
                <Send className="w-5 h-5" /> Seguir no Telegram
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#111111] py-9">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-[minmax(0,1.6fr)_1fr_1fr] gap-8 pb-8">
            <div>
              <Link to="/" className="inline-flex items-center mb-3">
                <img src={BRAND_LOGO} alt={SITE_NAME} className="h-12 w-auto object-contain" />
              </Link>
              <p className="text-white/50 text-sm max-w-sm leading-relaxed">
                Um catálogo editorial de ofertas realmente úteis. Filtramos o melhor para você encontrar com facilidade.
              </p>
            </div>
            <div>
              <h3 className="text-white/90 font-semibold text-sm mb-3">Categorias</h3>
              <ul className="space-y-2">
                <li><Link to="/categoria/casa-e-organizacao" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Casa e organização</Link></li>
                <li><Link to="/categoria/tecnologia" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Tecnologia</Link></li>
                <li><Link to="/categoria/cozinha" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Cozinha</Link></li>
                <li><Link to="/categoria/escritorio" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Escritório</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white/90 font-semibold text-sm mb-3">Navegação</h3>
              <ul className="space-y-2">
                <li><Link to="/" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Início</Link></li>
                <li><Link to="/categoria/abaixo-de-50" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Abaixo de R$ 50</Link></li>
                <li><Link to="/categoria/abaixo-de-100" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Abaixo de R$ 100</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row justify-between gap-3">
            <p className="text-white/40 text-xs leading-relaxed max-w-3xl">
              Publicidade: este site utiliza links de afiliado e pode receber comissão pelas compras, sem custo adicional para você. Preços e disponibilidade podem mudar no site da loja.
            </p>
            <p className="text-white/40 text-xs whitespace-nowrap">© 2026 {SITE_NAME}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
