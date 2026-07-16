const SYNONYMS = {
  celular: ["smartphone", "telefone"],
  smartphone: ["celular", "telefone"],
  tenis: ["sapato", "calcado"],
  tv: ["televisao", "smart tv"],
  notebook: ["laptop", "computador"],
  fone: ["headset", "auricular"],
  geladeira: ["refrigerador"],
  sofa: ["estofado"],
  roupa: ["moda", "vestuario"],
};

const normalize = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function searchGroups(value = "") {
  const tokens = normalize(value).match(/[a-z0-9]{2,}/g) || [];
  return tokens.slice(0, 6).map((token) => [...new Set([token, ...(SYNONYMS[token] || [])])]);
}
