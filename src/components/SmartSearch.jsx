import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, Package, Tag } from "lucide-react";
import { formatPrice, normalizeText } from "@/lib/catalog";
import { listPublicOffers } from "@/lib/offersApi";

export default function SmartSearch({ placeholder = "Buscar por nome, categoria..." }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [allOffers, setAllOffers] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const loadingRef = useRef(false);
  const inputId = useId();
  const resultsId = useId();
  const navigate = useNavigate();

  const loadOffers = useCallback(() => {
    if (allOffers.length || loadingRef.current) return;
    loadingRef.current = true;
    listPublicOffers({ limit: 100 })
      .then(setAllOffers)
      .catch(() => {})
      .finally(() => { loadingRef.current = false; });
  }, [allOffers.length]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setActiveIndex(-1);
      return;
    }
    const q = normalizeText(query);
    const matches = allOffers
      .filter((offer) => normalizeText(offer.name).includes(q) || normalizeText(offer.category).includes(q))
      .slice(0, 6);
    setResults(matches);
    setActiveIndex(matches.length ? 0 : -1);
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

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || !results.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + results.length) % results.length);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(results[activeIndex]);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={(e) => { e.preventDefault(); if (query.trim()) { navigate(`/buscar?q=${encodeURIComponent(query.trim())}`); setOpen(false); } }} className="relative">
        <label htmlFor={inputId} className="sr-only">{placeholder}</label>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#111111]/40 pointer-events-none" />
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); loadOffers(); }}
          onFocus={() => { setOpen(true); loadOffers(); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open && Boolean(query.trim())}
          aria-controls={resultsId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${resultsId}-${results[activeIndex]?.id}` : undefined}
          className="w-full pl-10 pr-4 py-2.5 bg-white rounded-full text-sm text-[#111111] placeholder:text-[#111111]/40 border border-[#111111]/8 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 transition"
        />
      </form>
      {open && query.trim() && (
        <div id={resultsId} role="listbox" className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-[#111111]/8 overflow-hidden z-50 max-h-[28rem] overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-[#111111]/40 mb-1">Nenhum resultado para "{query}"</p>
              <p className="text-xs text-[#111111]/30">Tente buscar por nome ou categoria</p>
            </div>
          ) : (
            <>
              <div className="px-4 pt-3 pb-1 text-[#111111]/30 text-xs font-medium uppercase tracking-wide">
                {results.length} resultado{results.length === 1 ? "" : "s"}
              </div>
              {results.map((offer) => (
                <button id={`${resultsId}-${offer.id}`} key={offer.id} type="button" role="option" aria-selected={activeIndex === results.indexOf(offer)} onClick={() => handleSelect(offer)} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F5F2EB] focus:bg-[#F5F2EB] focus:outline-none transition text-left border-b border-[#111111]/5 last:border-0 ${activeIndex === results.indexOf(offer) ? "bg-[#F5F2EB]" : ""}`}>
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#F5F2EB] shrink-0 flex items-center justify-center">
                    {offer.image ? <img src={offer.image} alt="" className="w-full h-full object-contain bg-white" /> : <Package className="w-4 h-4 text-[#111111]/30" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#111111] truncate">{offer.name}</p>
                    <p className="text-xs text-[#111111]/40 flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {offer.category}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-[#111111] shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatPrice(offer.price)}
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#111111]/30 shrink-0" />
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
