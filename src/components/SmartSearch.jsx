import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, Package, Tag } from "lucide-react";
import { formatPrice, normalizeText } from "@/lib/catalog";
import { searchPublicOffers } from "@/lib/offersApi";
import { StoreBadge } from "@/components/BrandIcons";

const RECENT_SEARCHES_KEY = "tb_recent_searches";

export default function SmartSearch({ placeholder = "Buscar por nome, categoria..." }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]"); } catch { return []; }
  });
  const containerRef = useRef(null);
  const searchSequence = useRef(0);
  const inputId = useId();
  const resultsId = useId();
  const navigate = useNavigate();

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setResults([]);
      setActiveIndex(-1);
      setSearching(false);
      return undefined;
    }

    let controller;
    const sequence = ++searchSequence.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      controller = new AbortController();
      searchPublicOffers(value, { signal: controller.signal })
        .then((matches) => {
          if (searchSequence.current !== sequence) return;
          setResults(matches);
          setActiveIndex(matches.length ? 0 : -1);
        })
        .catch((error) => {
          if (error?.name !== "AbortError" && searchSequence.current === sequence) setResults([]);
        })
        .finally(() => {
          if (searchSequence.current === sequence) setSearching(false);
        });
    }, 180);

    return () => {
      searchSequence.current += 1;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (offer) => {
    saveRecent(query || offer.name);
    navigate(`/oferta/${offer.id}`);
    setQuery("");
    setOpen(false);
  };

  const saveRecent = (value) => {
    const term = value.trim();
    if (!term) return;
    setRecentSearches((current) => {
      const next = [term, ...current.filter((item) => normalizeText(item) !== normalizeText(term))].slice(0, 5);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const submitSearch = (term = query) => {
    const value = term.trim();
    if (!value) return;
    saveRecent(value);
    navigate(`/buscar?q=${encodeURIComponent(value)}`);
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
      <form onSubmit={(event) => { event.preventDefault(); submitSearch(); }} className="relative">
        <label htmlFor={inputId} className="sr-only">{placeholder}</label>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#111111]/40 pointer-events-none" />
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
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
      {open && (query.trim() || recentSearches.length > 0) && (
        <div id={resultsId} role="listbox" className="absolute top-full mt-2 w-full bg-white rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.12)] border border-[#111111]/10 overflow-hidden z-50 max-h-[28rem] overflow-y-auto">
          {!query.trim() ? (
            <div className="p-2">
              <div className="px-3 pt-2 pb-1 text-[#111111]/30 text-xs font-medium uppercase">Buscas recentes</div>
              {recentSearches.map((term) => <button key={term} type="button" onClick={() => submitSearch(term)} className="w-full min-h-10 px-3 flex items-center gap-2 rounded-md text-sm text-[#111111]/65 hover:bg-[#F4F5F6] text-left"><Search className="w-4 h-4" /> {term}</button>)}
            </div>
          ) : searching ? (
            <div className="p-6 text-center text-sm text-[#111111]/40" role="status">Buscando...</div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-[#111111]/40 mb-1">Nenhum resultado para "{query}"</p>
              <p className="text-xs text-[#111111]/30">Tente buscar por nome ou categoria</p>
            </div>
          ) : (
            <>
              <div className="px-4 pt-3 pb-1 text-[#111111]/30 text-xs font-medium uppercase">
                {results.length} resultado{results.length === 1 ? "" : "s"}
              </div>
              {results.map((offer) => (
                <button id={`${resultsId}-${offer.id}`} key={offer.id} type="button" role="option" aria-selected={activeIndex === results.indexOf(offer)} onClick={() => handleSelect(offer)} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F5F2EB] focus:bg-[#F5F2EB] focus:outline-none transition text-left border-b border-[#111111]/5 last:border-0 ${activeIndex === results.indexOf(offer) ? "bg-[#F5F2EB]" : ""}`}>
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-[#F5F2EB] shrink-0 flex items-center justify-center">
                    {offer.image ? <img src={offer.image} alt="" className="w-full h-full object-contain bg-white" /> : <Package className="w-4 h-4 text-[#111111]/30" />}
                    <StoreBadge platform={offer.platform} compact />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#111111] truncate">{offer.name}</p>
                    <p className="text-xs text-[#111111]/40 flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {offer.category}
                    </p>
                  </div>
                  <span className="price-type text-sm text-[#111111] shrink-0">
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
