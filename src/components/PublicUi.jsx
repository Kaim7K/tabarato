import { PackageSearch } from "lucide-react";

export function PageShell({ children }) {
  return <div className="bg-[#F3F3F3] min-h-screen">{children}</div>;
}

export function SectionHeader({ eyebrow = "", title, description = "", children = null }) {
  return (
    <section className="bg-white border-b border-[#111111]/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {eyebrow && <p className="text-[#FF6B35] text-xs font-semibold uppercase mb-2">{eyebrow}</p>}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-[#111111] leading-tight">{title}</h1>
            {description && <p className="text-[#111111]/55 text-sm sm:text-base mt-2 max-w-2xl leading-relaxed">{description}</p>}
          </div>
          {children && <div className="w-full lg:w-auto lg:min-w-[24rem]">{children}</div>}
        </div>
      </div>
    </section>
  );
}

export function LoadingState({ label = "Carregando achados..." }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="bg-white rounded-lg overflow-hidden border border-[#111111]/8 animate-pulse">
            <div className="aspect-[4/3] bg-[#111111]/5" />
            <div className="p-4 space-y-3">
              <div className="h-3 bg-[#111111]/8 rounded w-1/3" />
              <div className="h-4 bg-[#111111]/8 rounded w-full" />
              <div className="h-4 bg-[#111111]/8 rounded w-4/5" />
              <div className="h-7 bg-[#111111]/8 rounded w-2/5 mt-5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = PackageSearch, title, description = "", action = null }) {
  return (
    <div className="bg-white border border-[#111111]/8 rounded-lg text-center py-14 sm:py-16 px-5">
      <Icon className="w-11 h-11 text-[#111111]/15 mx-auto mb-4" aria-hidden="true" />
      <p className="text-[#111111]/70 text-lg font-semibold">{title}</p>
      {description && <p className="text-[#111111]/45 text-sm mt-2 max-w-md mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function FilterChip({ active, children, ...props }) {
  return (
    <button
      type="button"
      className={`min-h-10 px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap transition focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/35 ${
        active ? "bg-[#111111] text-white" : "bg-white text-[#111111]/65 hover:text-[#111111] border border-[#111111]/10"
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

export function OfferGrid({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{children}</div>;
}

export function SectionTitle({ eyebrow = "", title, action = null }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        {eyebrow && <p className="text-[#FF6B35] text-xs font-semibold uppercase mb-1">{eyebrow}</p>}
        <h2 className="text-2xl sm:text-3xl font-semibold text-[#111111]">{title}</h2>
      </div>
      {action}
    </div>
  );
}
