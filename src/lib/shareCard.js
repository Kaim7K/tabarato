import { formatPrice } from "@/lib/catalog";
import { BRAND_LOGO_CARD } from "@/lib/brand";

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

const subjectBounds = (image) => {
  const sample = document.createElement("canvas");
  sample.width = 160;
  sample.height = 160;
  const context = sample.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, 160, 160);
  const pixels = context.getImageData(0, 0, 160, 160).data;
  let left = 160; let top = 160; let right = 0; let bottom = 0; let found = 0;
  for (let y = 0; y < 160; y += 1) {
    for (let x = 0; x < 160; x += 1) {
      const index = (y * 160 + x) * 4;
      if (pixels[index + 3] <= 20 || Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) >= 242) continue;
      found += 1; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (found < 160 * 160 * 0.015) return { x: 0, y: 0, width: image.width, height: image.height };
  const padding = 5;
  left = Math.max(0, left - padding); top = Math.max(0, top - padding); right = Math.min(159, right + padding); bottom = Math.min(159, bottom + padding);
  return { x: left / 160 * image.width, y: top / 160 * image.height, width: (right - left + 1) / 160 * image.width, height: (bottom - top + 1) / 160 * image.height };
};

const drawProduct = (context, image, area) => {
  const source = subjectBounds(image);
  const scale = Math.min(area.width / source.width, area.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  context.drawImage(image, source.x, source.y, source.width, source.height, area.x + (area.width - width) / 2, area.y + (area.height - height) / 2, width, height);
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

  context.fillStyle = "#ECEFEC";
  context.fillRect(0, 0, 1080, 1080);
  context.fillStyle = "#FFFFFF";
  context.beginPath();
  context.roundRect(34, 34, 1012, 1012, 34);
  context.fill();

  context.fillStyle = "#F7F8F6";
  context.beginPath();
  context.roundRect(66, 66, 948, 730, 24);
  context.fill();

  try {
    const product = await loadImage(offer.image, true);
    drawProduct(context, product, { x: 94, y: 88, width: 892, height: 686 });
  } catch {
    context.fillStyle = "#F4F5F6";
    context.fillRect(94, 88, 892, 686);
  }

  const percentage = discount(offer);
  if (percentage > 0) {
    context.fillStyle = "#15965D";
    context.beginPath();
    context.roundRect(792, 78, 198, 68, 34);
    context.fill();
    context.fillStyle = "#FFFFFF";
    context.font = "700 34px Montserrat, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(`-${percentage}%`, 891, 112);
  }

  context.shadowColor = "rgba(17,17,17,.18)";
  context.shadowBlur = 28;
  context.shadowOffsetY = 12;
  context.fillStyle = "#FFFFFF";
  context.beginPath();
  context.roundRect(70, 824, 940, 184, 92);
  context.fill();
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;

  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#111111";
  context.font = "700 56px Montserrat, Arial, sans-serif";
  const currentLabel = formatPrice(offer.price);
  context.fillText(currentLabel, 112, 916, 350);
  const currentWidth = Math.min(context.measureText(currentLabel).width, 350);

  if (Number(offer.previous_price) > Number(offer.price)) {
    const oldPrice = formatPrice(offer.previous_price);
    context.fillStyle = "#8D8D8D";
    const previousX = Math.min(470, 112 + currentWidth + 24);
    context.font = "600 25px Montserrat, Arial, sans-serif";
    context.fillText(oldPrice, previousX, 916, 190);
    const width = Math.min(context.measureText(oldPrice).width, 190);
    context.strokeStyle = "#8D8D8D";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(previousX, 921);
    context.lineTo(previousX + width, 911);
    context.stroke();
  }

  context.strokeStyle = "rgba(17,17,17,.16)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(748, 866);
  context.lineTo(748, 966);
  context.stroke();

  const [brand, store] = await Promise.all([
    loadImage(BRAND_LOGO_CARD).catch(() => null),
    storeLogo(offer.platform) ? loadImage(storeLogo(offer.platform)).catch(() => null) : null,
  ]);
  drawContained(context, store, { x: 650, y: 878, width: 62, height: 76 });
  drawContained(context, brand, { x: 786, y: 865, width: 178, height: 96 });

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
