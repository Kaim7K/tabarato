import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import ScrollToTop from './components/ScrollToTop';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import CategoryPage from '@/pages/CategoryPage';
import OfferDetail from '@/pages/OfferDetail';
import Admin from '@/pages/Admin';
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
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
