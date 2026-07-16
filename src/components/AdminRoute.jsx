import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { isAdminLoggedIn, validateAdminSession } from "@/lib/adminAuth";

export default function AdminRoute({ children }) {
  const location = useLocation();
  const [status, setStatus] = useState(() => (isAdminLoggedIn() ? "checking" : "blocked"));

  useEffect(() => {
    if (status !== "checking") return;
    let active = true;
    validateAdminSession().then((valid) => {
      if (active) setStatus(valid ? "allowed" : "blocked");
    });
    return () => { active = false; };
  }, [status]);

  if (status === "checking") {
    return <div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center">Validando acesso...</div>;
  }

  if (status === "blocked") return <Navigate to="/admin/login" replace state={{ from: location }} />;
  return children;
}
