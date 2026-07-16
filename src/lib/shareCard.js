import { formatPrice } from "@/lib/catalog";

const loadImage = (src, crossOrigin = false) => new Promise((resolve, reject) => {
  const image = new Image();
  if (crossOrigin) image.crossOrigin = "anonymous";
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const wrapText = (context, text, x, y, maxWidth, lineHeight, maxLines = 3) => {
  const words = text.split(/\s+/);
  let line = "";
  let lineIndex = 0;
  for (const word of words) {
    const test = `${line}${line ? " " : ""}${word}`;
    if (context.measureText(test).width > maxWidth && line) {
      context.fillText(line, x, y + lineIndex * lineHeight);
      line = word;
      lineIndex += 1;
      if (lineIndex >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (lineIndex < maxLines) context.fillText(line, x, y + lineIndex * lineHeight);
};

export async function shareOfferCard(offer) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d");

  context.fillStyle = "#F4F5F6";
  context.fillRect(0, 0, 1080, 1080);
  context.fillStyle = "#FFFFFF";
  context.fillRect(56, 56, 968, 968);

  try {
    const product = await loadImage(offer.image, true);
    const scale = Math.min(620 / product.width, 500 / product.height);
    const width = product.width * scale;
    const height = product.height * scale;
    context.drawImage(product, 540 - width / 2, 90 + (500 - height) / 2, width, height);
  } catch {
    context.fillStyle = "#F4F5F6";
    context.fillRect(170, 100, 740, 480);
  }

  context.fillStyle = "#111111";
  context.font = "700 46px Inter, Arial, sans-serif";
  wrapText(context, offer.name, 100, 660, 880, 58, 3);

  context.fillStyle = "#111111";
  context.font = "700 66px Inter, Arial, sans-serif";
  context.fillText(formatPrice(offer.price), 100, 870);

  if (offer.discount > 0) {
    context.fillStyle = "#168A55";
    context.fillRect(100, 905, 180, 64);
    context.fillStyle = "#FFFFFF";
    context.font = "700 30px Inter, Arial, sans-serif";
    context.fillText(`-${offer.discount}%`, 130, 947);
  }

  context.fillStyle = "#FF6B35";
  context.fillRect(0, 1010, 1080, 70);
  context.fillStyle = "#FFFFFF";
  context.font = "700 28px Inter, Arial, sans-serif";
  context.fillText(`TÁ BARATO  •  ${offer.platform || "OFERTA SELECIONADA"}`, 72, 1055);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Não foi possível gerar o card.");
  const file = new File([blob], `ta-barato-${offer.id}.png`, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: offer.name, text: `${formatPrice(offer.price)} no Tá Barato`, files: [file], url: offer.affiliate_link });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}
