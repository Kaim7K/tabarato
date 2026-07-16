import { Loader2, PackageSearch } from "lucide-react";

export function PageShell({ children }) {
  return <div className="bg-[#F5F2EB] min-h-screen">{children}</div>;
}

export function SectionHeader({ eyebrow = "", title, description = "", children = null }) {
  return (
    <section className="border-b border-[#111111]/8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {eyebrow && <p className="text-[#FF6B35] text-sm font-semibold uppercase tracking-widest mb-2">{eyebrow}</p>}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-5xl font-bold text-[#111111] tracking-tight leading-tight">{title}</h1>
            {description && <p className="text-[#111111]/55 text-base mt-3 max-w-2xl leading-relaxed">{description}</p>}
          </div>
          {children && <div className="w-full lg:w-auto lg:min-w-[22rem]">{children}</div>}
        </div>
      </div>
    </section>
  );
}

export function LoadingState({ label = "Carregando achados..." }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Loader2 className="w-8 h-8 text-[#111111]/30 animate-spin mb-3" />
      <p className="text-[#111111]/45 text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon = PackageSearch, title, description = "", action = null }) {
  return (
    <div className="text-center py-20 px-4">
      <Icon className="w-12 h-12 text-[#111111]/15 mx-auto mb-4" />
      <p className="text-[#111111]/55 text-lg font-semibold">{title}</p>
      {description && <p className="text-[#111111]/35 text-sm mt-2 max-w-md mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function FilterChip({ active, children, ...props }) {
  return (
    <button
      type="button"
      className={`min-h-10 px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/35 ${
        active ? "bg-[#111111] text-white" : "bg-white text-[#111111]/65 hover:text-[#111111] hover:bg-white/90 border border-[#111111]/8"
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

export function OfferGrid({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">{children}</div>;
}
