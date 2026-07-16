import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, LockKeyhole } from "lucide-react";
import { SITE_NAME } from "@/lib/catalog";
import { isAdminLoggedIn, loginAdmin, validateAdminSession } from "@/lib/adminAuth";
import { BRAND_LOGO } from "@/lib/brand";

export default function AdminLogin() {
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(() => isAdminLoggedIn());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!checking) return;
    let active = true;
    validateAdminSession().then((valid) => {
      if (valid) window.location.href = location.state?.from?.pathname || "/admin";
      else if (active) setChecking(false);
    });
    return () => { active = false; };
  }, [checking, location.state?.from?.pathname]);

  if (checking) {
    return <div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center">Validando acesso...</div>;
  }

  if (isAdminLoggedIn()) {
    return <Navigate to={location.state?.from?.pathname || "/admin"} replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginAdmin(username.trim(), password);
      window.location.href = location.state?.from?.pathname || "/admin";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-7">
          <img src={BRAND_LOGO} alt={SITE_NAME} className="h-14 w-auto object-contain" />
          <div>
            <h1 className="font-bold text-xl">{SITE_NAME}</h1>
            <p className="text-white/45 text-sm">Painel administrativo</p>
          </div>
        </div>

        <label className="block mb-4">
          <span className="block text-xs text-white/50 mb-1.5">Usuario</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} autoComplete="username" autoFocus />
        </label>

        <label className="block mb-5">
          <span className="block text-xs text-white/50 mb-1.5">Senha</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className={inputCls} autoComplete="current-password" />
        </label>

        {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

        <button disabled={loading} className="w-full px-5 py-3 bg-[#FF6B35] hover:bg-[#D95426] rounded-xl font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockKeyhole className="w-4 h-4" />}
          Entrar
        </button>
      </form>
    </div>
  );
}

const inputCls = "w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#FF6B35]/50";
