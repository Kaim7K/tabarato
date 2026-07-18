(() => {
  if (globalThis.TaBaratoArtwork) return;

  const SIZE = 1080;

  const fitCoverOrContain = (width, height, area, mode = "contain") => {
    const scale = mode === "cover"
      ? Math.max(area.width / width, area.height / height)
      : Math.min(area.width / width, area.height / height);
    const targetWidth = Math.max(1, width * scale);
    const targetHeight = Math.max(1, height * scale);
    return {
      x: area.x + (area.width - targetWidth) / 2,
      y: area.y + (area.height - targetHeight) / 2,
      width: targetWidth,
      height: targetHeight,
    };
  };

  const roundedRect = (context, x, y, width, height, radius) => {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
  };

  const drawContainedImage = (context, image, area) => {
    if (!image?.width || !image?.height) return;
    const target = fitCoverOrContain(image.width, image.height, area, "contain");
    context.drawImage(image, target.x, target.y, target.width, target.height);
  };

  const canvasBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Nao foi possivel gerar a arte da oferta."));
    }, "image/png", 0.92);
  });

  const formatPrice = (value) => {
    const price = Number(value);
    return Number.isFinite(price) && price > 0
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price)
      : "Preco indisponivel";
  };

  const discountPercent = (currentPrice, previousPrice) => {
    const current = Number(currentPrice);
    const previous = Number(previousPrice);
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= current) return 0;
    return Math.max(1, Math.round((1 - current / previous) * 100));
  };

  const drawLogo = (context, image, area) => {
    if (!image) return;
    drawContainedImage(context, image, area);
  };

  async function createOfferArtwork({ productBlob, siteLogoBlob, storeLogoBlob, currentPrice, previousPrice }) {
    const [productImage, siteLogo, storeLogo] = await Promise.all([
      createImageBitmap(productBlob),
      siteLogoBlob ? createImageBitmap(siteLogoBlob) : null,
      storeLogoBlob ? createImageBitmap(storeLogoBlob) : null,
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext("2d", { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const gradient = context.createLinearGradient(0, 0, 0, SIZE);
    gradient.addColorStop(0, "#f8faf8");
    gradient.addColorStop(1, "#eef1ee");
    context.fillStyle = gradient;
    context.fillRect(0, 0, SIZE, SIZE);

    context.fillStyle = "#ffffff";
    roundedRect(context, 36, 36, 1008, 1008, 38);
    context.fill();

    drawContainedImage(context, productImage, { x: 74, y: 70, width: 932, height: 790 });

    const discount = discountPercent(currentPrice, previousPrice);
    if (discount > 0) {
      context.fillStyle = "#15965d";
      roundedRect(context, 754, 76, 246, 76, 38);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "800 38px Arial, sans-serif";
      context.textBaseline = "middle";
      context.textAlign = "center";
      context.fillText(`-${discount}%`, 877, 114);
      context.textAlign = "start";
    }

    const bar = { x: 70, y: 842, width: 940, height: 154 };
    context.shadowColor = "rgba(17,17,17,.18)";
    context.shadowBlur = 28;
    context.shadowOffsetY = 12;
    context.fillStyle = "#ffffff";
    roundedRect(context, bar.x, bar.y, bar.width, bar.height, 77);
    context.fill();
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;

    context.fillStyle = "#111111";
    context.font = "900 58px Arial, sans-serif";
    context.textBaseline = "alphabetic";
    context.fillText(formatPrice(currentPrice), 112, 930, 360);

    if (discount > 0) {
      const oldPrice = formatPrice(previousPrice);
      context.fillStyle = "#8d8d8d";
      context.font = "700 28px Arial, sans-serif";
      context.fillText(oldPrice, 112, 966, 260);
      const measure = context.measureText(oldPrice);
      context.strokeStyle = "#8d8d8d";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(112, 956);
      context.lineTo(112 + Math.min(measure.width, 260), 944);
      context.stroke();
    }

    context.strokeStyle = "rgba(17,17,17,.16)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(704, 876);
    context.lineTo(704, 962);
    context.stroke();

    drawLogo(context, storeLogo, { x: 598, y: 884, width: 70, height: 70 });
    drawLogo(context, siteLogo, { x: 732, y: 878, width: 224, height: 82 });

    productImage.close?.();
    siteLogo?.close?.();
    storeLogo?.close?.();
    return canvasBlob(canvas);
  }

  globalThis.TaBaratoArtwork = { createOfferArtwork };
})();
