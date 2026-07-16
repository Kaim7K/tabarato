export const statusLabels = {
  RASCUNHO: "Rascunho",
  APROVADO: "Aprovado",
  AGENDADO: "Agendado",
  PUBLICANDO: "Publicando",
  PUBLICADO: "Publicado",
  ERRO: "Erro",
  EXPIRADO: "Expirado",
};

export const statusClasses = {
  RASCUNHO: "bg-white/10 text-white/55",
  APROVADO: "bg-blue-500/15 text-blue-300",
  AGENDADO: "bg-yellow-500/15 text-yellow-300",
  PUBLICANDO: "bg-purple-500/15 text-purple-300",
  PUBLICADO: "bg-[#168A55]/15 text-[#4ade80]",
  ERRO: "bg-red-500/15 text-red-300",
  EXPIRADO: "bg-white/10 text-white/35",
};

export const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

