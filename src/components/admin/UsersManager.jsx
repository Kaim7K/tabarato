import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { UserPlus, Loader2, Check, Mail, Shield, User as UserIcon } from "lucide-react";

export default function UsersManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [inviting, setInviting] = useState(false);
  const [toast, setToast] = useState("");

  const load = () => {
    base44.entities.User.list()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  const handleInvite = async () => {
    if (!email) return;
    setInviting(true);
    try {
      await base44.users.inviteUser(email, role);
      showToast("Convite enviado para " + email);
      setEmail("");
      load();
    } catch (e) {
      showToast("Erro ao convidar usuário");
    }
    setInviting(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Usuários</h2>
        <p className="text-white/40 text-sm">{users.length} usuário{users.length === 1 ? "" : "s"} no sistema</p>
      </div>

      {/* Invite form */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[#FF6B35]" /> Convidar usuário
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#FF6B35]/50"
            />
          </div>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-[#FF6B35]/50">
            <option value="user" className="bg-[#0D0D0D]">Usuário</option>
            <option value="admin" className="bg-[#0D0D0D]">Administrador</option>
          </select>
          <button disabled={inviting} onClick={handleInvite} className="px-5 py-2.5 bg-[#FF6B35] hover:bg-[#D95426] text-white font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-2 justify-center">
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Convidar
          </button>
        </div>
        <p className="text-white/30 text-xs mt-3">O convite será enviado por email. O usuário precisará confirmar para acessar o sistema.</p>
      </div>

      {/* User list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-white/20 animate-spin" /></div>
      ) : (
        <div className="space-y-2.5">
          {users.map((u) => (
            <div key={u.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                {u.full_name ? (
                  <span className="text-sm font-bold text-white">{u.full_name.charAt(0).toUpperCase()}</span>
                ) : (
                  <UserIcon className="w-5 h-5 text-white/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-white truncate">{u.full_name || "Sem nome"}</h4>
                <p className="text-white/40 text-xs truncate">{u.email}</p>
              </div>
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full shrink-0 flex items-center gap-1 ${
                u.role === "admin" ? "bg-[#FF6B35]/15 text-[#FF6B35]" : "bg-white/10 text-white/50"
              }`}>
                {u.role === "admin" ? <Shield className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                {u.role === "admin" ? "Admin" : "Usuário"}
              </span>
            </div>
          ))}
          {users.length === 0 && (
            <div className="text-center py-16 text-white/30">
              <UserIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum usuário no sistema ainda</p>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 bg-white text-[#111111] rounded-xl text-sm font-medium shadow-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-[#168A55]" /> {toast}
        </div>
      )}
    </div>
  );
}