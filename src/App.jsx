import { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import Layout from '@/components/Layout';
import AdminRoute from '@/components/AdminRoute';
import Home from '@/pages/Home';

const CategoryPage = lazy(() => import('@/pages/CategoryPage'));
const OfferDetail = lazy(() => import('@/pages/OfferDetail'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const Favorites = lazy(() => import('@/pages/Favorites'));
const Radar = lazy(() => import('@/pages/Radar'));
const Compare = lazy(() => import('@/pages/Compare'));
const Alerts = lazy(() => import('@/pages/Alerts'));
const PageNotFound = lazy(() => import('@/lib/PageNotFound'));
const AdminOffers = lazy(() => import('@/pages/AdminOffers'));
const AdminLogin = lazy(() => import('@/pages/AdminLogin'));

function App() {

  return (
    <Router>
      <ScrollToTop />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/categoria/:slug" element={<CategoryPage />} />
            <Route path="/oferta/:id" element={<OfferDetail />} />
            <Route path="/buscar" element={<SearchPage />} />
            <Route path="/favoritos" element={<Favorites />} />
            <Route path="/radar" element={<Radar />} />
            <Route path="/comparar" element={<Compare />} />
            <Route path="/alertas" element={<Alerts />} />
          </Route>
          <Route path="/admin/login" element={<AdminShell><AdminLogin /></AdminShell>} />
          <Route path="/admin" element={<AdminRoute><AdminShell><AdminOffers /></AdminShell></AdminRoute>} />
          <Route path="/admin/ofertas" element={<AdminRoute><AdminShell><AdminOffers /></AdminShell></AdminRoute>} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    </Router>
  )
}

function AdminShell({ children }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center">Carregando painel...</div>}>
      {children}
    </Suspense>
  );
}

function PageLoading() {
  return (
    <div className="min-h-screen bg-[#F5F2EB] text-[#111111] flex items-center justify-center" role="status" aria-live="polite">
      <span className="text-sm font-medium text-[#111111]/55">Carregando...</span>
    </div>
  );
}

export default App
