import { formatPrice } from "@/lib/catalog";
import { BRAND_LOGO } from "@/lib/brand";

const loadImage = (src, crossOrigin = false) => new Promise((resolve, reject) => {
  const image = new Image();
  if (crossOrigin) image.crossOrigin = "anonymous";
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const contained = (image, area) => {
  const scale = Math.min(area.width / image.width, area.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height };
};

const drawContained = (context, image, area) => {
  if (!image?.width) return;
  const target = contained(image, area);
  context.drawImage(image, target.x, target.y, target.width, target.height);
};

const discount = (offer) => {
  const current = Number(offer.price);
  const previous = Number(offer.previous_price);
  return previous > current && current > 0 ? Math.round((1 - current / previous) * 100) : Number(offer.discount || 0);
};

const storeLogo = (platform = "") => {
  if (/mercado livre/i.test(platform)) return "/brands/mercado-livre.png";
  if (/shopee/i.test(platform)) return "/brands/shopee.svg";
  return "";
};

export async function shareOfferCard(offer) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.fillStyle = "#EEF1EE";
  context.fillRect(0, 0, 1080, 1080);
  context.fillStyle = "#FFFFFF";
  context.beginPath();
  context.roundRect(36, 36, 1008, 1008, 38);
  context.fill();

  try {
    const product = await loadImage(offer.image, true);
    drawContained(context, product, { x: 74, y: 70, width: 932, height: 790 });
  } catch {
    context.fillStyle = "#F4F5F6";
    context.fillRect(74, 70, 932, 790);
  }

  const percentage = discount(offer);
  if (percentage > 0) {
    context.fillStyle = "#15965D";
    context.beginPath();
    context.roundRect(754, 76, 246, 76, 38);
    context.fill();
    context.fillStyle = "#FFFFFF";
    context.font = "800 38px Montserrat, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(`-${percentage}%`, 877, 114);
  }

  context.shadowColor = "rgba(17,17,17,.18)";
  context.shadowBlur = 28;
  context.shadowOffsetY = 12;
  context.fillStyle = "#FFFFFF";
  context.beginPath();
  context.roundRect(70, 842, 940, 154, 77);
  context.fill();
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;

  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#111111";
  context.font = "900 58px Montserrat, Arial, sans-serif";
  context.fillText(formatPrice(offer.price), 112, 930, 370);

  if (Number(offer.previous_price) > Number(offer.price)) {
    const oldPrice = formatPrice(offer.previous_price);
    context.fillStyle = "#8D8D8D";
    context.font = "700 28px Montserrat, Arial, sans-serif";
    context.fillText(oldPrice, 112, 966, 260);
    const width = Math.min(context.measureText(oldPrice).width, 260);
    context.strokeStyle = "#8D8D8D";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(112, 956);
    context.lineTo(112 + width, 944);
    context.stroke();
  }

  context.strokeStyle = "rgba(17,17,17,.16)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(704, 876);
  context.lineTo(704, 962);
  context.stroke();

  const [brand, store] = await Promise.all([
    loadImage(BRAND_LOGO).catch(() => null),
    storeLogo(offer.platform) ? loadImage(storeLogo(offer.platform)).catch(() => null) : null,
  ]);
  drawContained(context, store, { x: 598, y: 884, width: 70, height: 70 });
  drawContained(context, brand, { x: 732, y: 878, width: 224, height: 82 });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.94));
  if (!blob) throw new Error("Nao foi possivel gerar o card.");
  const file = new File([blob], `ta-barato-${offer.id}.png`, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: offer.name, text: `${formatPrice(offer.price)} no Ta Barato`, files: [file], url: offer.affiliate_link });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}
