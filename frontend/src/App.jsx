import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import WorkOrders from "@/pages/WorkOrders";
import WorkOrderDetail from "@/pages/WorkOrderDetail";
import Bills from "@/pages/Bills";
import VendorProfile from "@/pages/VendorProfile";
import Documents from "@/pages/Documents";
import Admin from "@/pages/Admin";
import ChangePassword from "@/pages/ChangePassword";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.jsx.
export default function App() {
  return (
    <I18nProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/work-orders" element={<WorkOrders />} />
        <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/vendor-profile" element={<VendorProfile />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      {/* bottom-right: a top-right toast overlays the header's logout + language controls */}
      <Toaster position="bottom-right" richColors />
    </I18nProvider>
  );
}
