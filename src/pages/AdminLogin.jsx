import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, LockKeyhole } from "lucide-react";
import { SITE_NAME } from "@/lib/catalog";
import { isAdminLoggedIn, loginAdmin, validateAdminSession } from "@/lib/adminAuth";
import { BRAND_LOGO_DARK } from "@/lib/brand";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

export default function AdminLogin() {
  useDocumentMetadata("Acesso administrativo | Tá Barato", undefined, "noindex, nofollow");
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(() => isAdminLoggedIn());
  const [error, setError] = useState("");
  const returnTo = location.state?.from
    ? `${location.state.from.pathname || ""}${location.state.from.search || ""}`
    : "/admin";

  useEffect(() => {
    if (!checking) return;
    let active = true;
    validateAdminSession().then((valid) => {
      if (valid) window.location.href = returnTo;
      else if (active) setChecking(false);
    });
    return () => { active = false; };
  }, [checking, returnTo]);

  if (checking) {
    return <div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center" role="status">Validando acesso...</div>;
  }

  if (isAdminLoggedIn()) {
    return <Navigate to={returnTo} replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginAdmin(username.trim(), password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white/5 border border-white/10 rounded-lg p-6 shadow-2xl">
        <div className="mb-7">
          <img src={BRAND_LOGO_DARK} alt={SITE_NAME} className="h-14 max-w-full w-auto object-contain object-left" />
          <p className="mt-3 text-white/45 text-sm">Painel administrativo</p>
        </div>

        <label className="block mb-4">
          <span className="block text-xs text-white/50 mb-1.5">Usuario</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} autoComplete="username" autoFocus />
        </label>

        <label className="block mb-5">
          <span className="block text-xs text-white/50 mb-1.5">Senha</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className={inputCls} autoComplete="current-password" />
        </label>

        {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

        <button disabled={loading} className="w-full px-5 py-3 bg-[#FF6B35] hover:bg-[#D95426] rounded-lg font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockKeyhole className="w-4 h-4" />}
          Entrar
        </button>
      </form>
    </div>
  );
}

const inputCls = "w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#FF6B35]/50";
