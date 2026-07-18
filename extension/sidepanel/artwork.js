(() => {
  if (globalThis.TaBaratoArtwork) return;

  const SIZE = 1080;
  const roundedRect = (context, x, y, width, height, radius) => {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
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
        const visible = pixels[index + 3] > 20 && Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) < 242;
        if (!visible) continue;
        found += 1; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    if (found < 160 * 160 * 0.015) return { x: 0, y: 0, width: image.width, height: image.height };
    const padding = 5;
    left = Math.max(0, left - padding); top = Math.max(0, top - padding);
    right = Math.min(159, right + padding); bottom = Math.min(159, bottom + padding);
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
    if (!image?.width || !image?.height) return;
    const scale = Math.min(area.width / image.width, area.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, area.x + (area.width - width) / 2, area.y + (area.height - height) / 2, width, height);
  };

  const formatPrice = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
  const discountPercent = (current, previous) => Number(previous) > Number(current) && Number(current) > 0 ? Math.round((1 - Number(current) / Number(previous)) * 100) : 0;
  const canvasBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Nao foi possivel gerar a arte.")), "image/png", 0.94));

  async function createOfferArtwork({ productBlob, siteLogoBlob, storeLogoBlob, currentPrice, previousPrice }) {
    const [product, siteLogo, storeLogo] = await Promise.all([
      createImageBitmap(productBlob),
      siteLogoBlob ? createImageBitmap(siteLogoBlob) : null,
      storeLogoBlob ? createImageBitmap(storeLogoBlob) : null,
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE; canvas.height = SIZE;
    const context = canvas.getContext("2d", { alpha: false });
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";

    context.fillStyle = "#E9EDE9";
    context.fillRect(0, 0, SIZE, SIZE);
    context.fillStyle = "#FFFFFF";
    roundedRect(context, 18, 18, 1044, 1044, 34); context.fill();

    context.fillStyle = "#F7F8F6";
    roundedRect(context, 30, 30, 1020, 884, 24); context.fill();
    drawProduct(context, product, { x: 42, y: 42, width: 996, height: 860 });

    const discount = discountPercent(currentPrice, previousPrice);
    if (discount > 0) {
      context.fillStyle = "#15965D";
      roundedRect(context, 814, 48, 214, 72, 36); context.fill();
      context.fillStyle = "#FFFFFF";
      context.font = "700 34px Montserrat, Arial, sans-serif";
      context.textAlign = "center"; context.textBaseline = "middle";
      context.fillText(`-${discount}%`, 921, 84);
    }

    context.shadowColor = "rgba(17,17,17,.18)"; context.shadowBlur = 24; context.shadowOffsetY = 8;
    context.fillStyle = "#FFFFFF";
    roundedRect(context, 42, 918, 996, 126, 63); context.fill();
    context.shadowColor = "transparent"; context.shadowBlur = 0; context.shadowOffsetY = 0;

    context.textAlign = "left"; context.textBaseline = "middle";
    context.fillStyle = "#111111"; context.font = "700 54px Montserrat, Arial, sans-serif";
    const currentLabel = formatPrice(currentPrice);
    context.fillText(currentLabel, 76, 981, 360);
    const currentWidth = Math.min(context.measureText(currentLabel).width, 360);

    if (discount > 0) {
      const previousLabel = formatPrice(previousPrice);
      const previousX = Math.min(470, 76 + currentWidth + 20);
      context.fillStyle = "#8B8F8C"; context.font = "600 24px Montserrat, Arial, sans-serif";
      context.fillText(previousLabel, previousX, 981, 200);
      const previousWidth = Math.min(context.measureText(previousLabel).width, 200);
      context.strokeStyle = "#8B8F8C"; context.lineWidth = 3;
      context.beginPath(); context.moveTo(previousX, 986); context.lineTo(previousX + previousWidth, 976); context.stroke();
    }

    context.strokeStyle = "rgba(17,17,17,.13)"; context.lineWidth = 2;
    context.beginPath(); context.moveTo(780, 940); context.lineTo(780, 1022); context.stroke();
    drawContained(context, storeLogo, { x: 684, y: 946, width: 62, height: 70 });
    drawContained(context, siteLogo, { x: 814, y: 940, width: 190, height: 82 });

    product.close?.(); siteLogo?.close?.(); storeLogo?.close?.();
    return canvasBlob(canvas);
  }

  globalThis.TaBaratoArtwork = { createOfferArtwork };
})();
