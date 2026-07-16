import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, ArrowRight, Package, Tag, Barcode, Hash } from "lucide-react";
import { formatPrice, normalizeText } from "@/lib/catalog";

export default function SmartSearch({ placeholder = "Buscar por nome, categoria, código..." }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [allOffers, setAllOffers] = useState([]);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    base44.entities.Offer.filter({ status: "published" }, "-published_date", 100)
      .then(setAllOffers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const q = normalizeText(query);
    const filtered = allOffers
      .filter(
        (o) =>
          normalizeText(o.name).includes(q) ||
          normalizeText(o.category).includes(q) ||
          normalizeText(o.barcode).includes(q) ||
          normalizeText(o.internal_code).includes(q)
      )
      .slice(0, 6);
    setResults(filtered);
  }, [query, allOffers]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (offer) => {
    navigate(`/oferta/${offer.id}`);
    setQuery("");
    setOpen(false);
  };

  const matchType = (offer, q) => {
    if (normalizeText(offer.barcode).includes(q)) return { icon: Barcode, label: "Código de barras" };
    if (normalizeText(offer.internal_code).includes(q)) return { icon: Hash, label: "Código interno" };
    if (normalizeText(offer.category).includes(q)) return { icon: Tag, label: "Categoria" };
    return { icon: Package, label: "Produto" };
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={(e) => { e.preventDefault(); if (query.trim()) { navigate(`/buscar?q=${encodeURIComponent(query.trim())}`); setOpen(false); } }} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#111111]/40 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2.5 bg-white rounded-full text-sm text-[#111111] placeholder:text-[#111111]/40 border border-[#111111]/8 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 transition"
        />
      </form>
      {open && query.trim() && (
        <div className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-[#111111]/8 overflow-hidden z-50 max-h-[28rem] overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-[#111111]/40 mb-1">Nenhum resultado para "{query}"</p>
              <p className="text-xs text-[#111111]/30">Tente buscar por nome, categoria ou código</p>
            </div>
          ) : (
            <>
              <div className="px-4 pt-3 pb-1 text-[#111111]/30 text-xs font-medium uppercase tracking-wide">
                {results.length} resultado{results.length === 1 ? "" : "s"}
              </div>
              {results.map((offer) => {
                const mt = matchType(offer, normalizeText(query));
                return (
                  <button
                    key={offer.id}
                    onClick={() => handleSelect(offer)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F5F2EB] transition text-left border-b border-[#111111]/5 last:border-0"
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#F5F2EB] shrink-0 flex items-center justify-center">
                      {offer.image ? (
                        <img src={offer.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <mt.icon className="w-4 h-4 text-[#111111]/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#111111] truncate">{offer.name}</p>
                      <p className="text-xs text-[#111111]/40 flex items-center gap-1">
                        <mt.icon className="w-3 h-3" />
                        {offer.category} · {mt.label}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-[#111111] shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {formatPrice(offer.price)}
                    </span>
                    <ArrowRight className="w-4 h-4 text-[#111111]/30 shrink-0" />
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
