import { Link } from "react-router-dom";
import { Zap, Send } from "lucide-react";
import { SITE_NAME } from "@/lib/catalog";

export default function Footer() {
  const [firstWord, ...rest] = SITE_NAME.split(" ");
  const restName = rest.join(" ");

  return (
    <footer className="mt-24">
      <div id="grupo" className="bg-[#FF6B35] py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-white/70 text-sm font-medium uppercase tracking-widest mb-4">Não perca nenhum achado</p>
          <h2 className="text-white text-3xl sm:text-5xl font-bold tracking-tight mb-4 leading-tight">
            Receba os melhores achados diretamente no Telegram.
          </h2>
          <p className="text-white/80 text-lg mb-10 max-w-xl mx-auto">
            A gente filtra. Você encontra. Acompanhe o canal para receber ofertas selecionadas em primeira mão.
          </p>
          <a href="https://t.me/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-[#111111] font-semibold rounded-full hover:bg-white/90 transition shadow-lg">
            <Send className="w-5 h-5" /> Seguir no Telegram
          </a>
        </div>
      </div>
      <div className="bg-[#111111] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2">
              <Link to="/" className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-[#FF6B35]" fill="currentColor" />
                </div>
                <span className="font-bold text-white text-xl tracking-tight">
                  {firstWord} {restName && <span className="text-[#FF6B35]">{restName}</span>}
                </span>
              </Link>
              <p className="text-white/50 text-sm max-w-xs leading-relaxed">
                Um catálogo editorial de ofertas realmente úteis. Filtramos o melhor para você encontrar com facilidade.
              </p>
            </div>
            <div>
              <h4 className="text-white/90 font-semibold text-sm mb-4">Categorias</h4>
              <ul className="space-y-2.5">
                <li><Link to="/categoria/casa-e-organizacao" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Casa e organização</Link></li>
                <li><Link to="/categoria/tecnologia" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Tecnologia</Link></li>
                <li><Link to="/categoria/cozinha" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Cozinha</Link></li>
                <li><Link to="/categoria/escritorio" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Escritório</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white/90 font-semibold text-sm mb-4">Navegação</h4>
              <ul className="space-y-2.5">
                <li><Link to="/" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Início</Link></li>
                <li><Link to="/categoria/abaixo-de-50" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Abaixo de R$ 50</Link></li>
                <li><Link to="/categoria/abaixo-de-100" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Abaixo de R$ 100</Link></li>
                <li><Link to="/admin/ofertas" className="text-white/50 text-sm hover:text-[#FF6B35] transition">Painel admin</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-white/40 text-xs leading-relaxed max-w-2xl">
              Publicidade: este site utiliza links de afiliado e pode receber comissão pelas compras, sem custo adicional para você. Preços e disponibilidade podem mudar no site da loja.
            </p>
            <p className="text-white/40 text-xs">© 2026 {SITE_NAME}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

