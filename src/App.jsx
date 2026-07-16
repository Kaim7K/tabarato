import { Toaster } from "@/components/ui/toaster"
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
import Admin from '@/pages/Admin';
import AdminOffers from '@/pages/AdminOffers';
import AdminLogin from '@/pages/AdminLogin';
import SearchPage from '@/pages/SearchPage';
import Favorites from '@/pages/Favorites';

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
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="/admin/ofertas" element={<AdminRoute><AdminOffers /></AdminRoute>} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
