import { Navigate, useLocation } from "react-router-dom";
import { isAdminLoggedIn } from "@/lib/adminAuth";

export default function AdminRoute({ children }) {
  const location = useLocation();
  if (!isAdminLoggedIn()) return <Navigate to="/admin/login" replace state={{ from: location }} />;
  return children;
}
