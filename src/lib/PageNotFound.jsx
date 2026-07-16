import { Link, useLocation } from "react-router-dom";

export default function PageNotFound() {
  const location = useLocation();
  const pageName = location.pathname.substring(1);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F2EB]">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-7xl font-light text-[#111111]/20">404</h1>
          <div className="h-0.5 w-16 bg-[#111111]/10 mx-auto"></div>
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-[#111111]">Página não encontrada</h2>
          <p className="text-[#111111]/60 leading-relaxed">
            A página <span className="font-medium text-[#111111]">"{pageName}"</span> não existe ou foi removida.
          </p>
        </div>
        <div className="pt-4">
          <Link
            to="/"
            className="inline-flex items-center px-5 py-3 text-sm font-semibold text-white bg-[#FF6B35] rounded-full hover:bg-[#D95426] transition"
          >
            Voltar para o início
          </Link>
        </div>
      </div>
    </div>
  );
}
