import { Toaster } from "@/components/ui/toaster"
import { Suspense, lazy } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import ScrollToTop from './components/ScrollToTop';
import Layout from '@/components/Layout';
import AdminRoute from '@/components/AdminRoute';
import Home from '@/pages/Home';
import CategoryPage from '@/pages/CategoryPage';
import OfferDetail from '@/pages/OfferDetail';
import SearchPage from '@/pages/SearchPage';
import Favorites from '@/pages/Favorites';

const Admin = lazy(() => import('@/pages/Admin'));
const AdminOffers = lazy(() => import('@/pages/AdminOffers'));
const AdminLogin = lazy(() => import('@/pages/AdminLogin'));

function App() {

  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/categoria/:slug" element={<CategoryPage />} />
            <Route path="/oferta/:id" element={<OfferDetail />} />
            <Route path="/buscar" element={<SearchPage />} />
            <Route path="/favoritos" element={<Favorites />} />
          </Route>
          <Route path="/admin/login" element={<AdminShell><AdminLogin /></AdminShell>} />
          <Route path="/admin" element={<AdminRoute><AdminShell><Admin /></AdminShell></AdminRoute>} />
          <Route path="/admin/ofertas" element={<AdminRoute><AdminShell><AdminOffers /></AdminShell></AdminRoute>} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

function AdminShell({ children }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center">Carregando painel...</div>}>
      {children}
    </Suspense>
  );
}

export default App
