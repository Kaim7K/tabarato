(() => {
  if (globalThis.TaBaratoArtwork) return;

  const SIZE = 720;

  const fit = (width, height, area) => {
    const scale = Math.min(area.width / width, area.height / height);
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

  const ellipsize = (context, value, maxWidth) => {
    let text = String(value || "").trim();
    while (text && context.measureText(`${text}...`).width > maxWidth) text = text.slice(0, -1).trimEnd();
    return `${text || "Produto"}...`;
  };

  const wrapTitle = (context, value, maxWidth, maxLines = 2) => {
    const words = String(value || "Produto em oferta").trim().split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        return;
      }
      lines.push(line);
      line = word;
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines[maxLines - 1] = ellipsize(context, lines.slice(maxLines - 1).join(" "), maxWidth);
      return lines.slice(0, maxLines);
    }
    return lines;
  };

  const drawContainedImage = (context, image, area) => {
    if (!image?.width || !image?.height) return;
    const target = fit(image.width, image.height, area);
    context.drawImage(image, target.x, target.y, target.width, target.height);
  };

  const drawStoreBrand = (context, image, platform) => {
    const box = { x: 482, y: 654, width: 210, height: 48 };
    context.fillStyle = "rgba(255,255,255,.96)";
    roundedRect(context, box.x, box.y, box.width, box.height, 7);
    context.fill();
    if (image) drawContainedImage(context, image, { x: box.x + 10, y: box.y + 8, width: 34, height: 32 });
    context.fillStyle = "#171717";
    context.font = "700 18px Arial, sans-serif";
    context.textBaseline = "middle";
    const label = String(platform || "Loja").slice(0, 22);
    context.fillText(label, box.x + 54, box.y + box.height / 2, box.width - 64);
  };

  const canvasBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Nao foi possivel gerar a arte da oferta."));
    }, "image/png");
  });

  const formatPrice = (value) => {
    const price = Number(value);
    return Number.isFinite(price) && price > 0
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price)
      : "Preco indisponivel";
  };

  async function createOfferArtwork({ productBlob, siteLogoBlob, storeLogoBlob, productName, currentPrice, previousPrice, platform }) {
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

    context.fillStyle = "#eef0f2";
    context.fillRect(0, 0, SIZE, SIZE);
    context.fillStyle = "#ffffff";
    context.fillRect(8, 8, 704, 704);

    context.fillStyle = "#f8f9fa";
    context.fillRect(34, 28, 652, 360);
    drawContainedImage(context, productImage, { x: 54, y: 42, width: 612, height: 332 });

    context.fillStyle = "#151515";
    context.font = "700 31px Arial, sans-serif";
    context.textBaseline = "alphabetic";
    const titleLines = wrapTitle(context, productName, 608, 2);
    titleLines.forEach((line, index) => context.fillText(line, 56, 438 + index * 39));

    const priceY = 438 + titleLines.length * 39 + 42;
    context.font = "700 46px Arial, sans-serif";
    context.fillText(formatPrice(currentPrice), 56, priceY);

    const current = Number(currentPrice);
    const previous = Number(previousPrice);
    if (Number.isFinite(current) && Number.isFinite(previous) && previous > current) {
      const discount = Math.max(1, Math.round((1 - current / previous) * 100));
      context.fillStyle = "#14965f";
      roundedRect(context, 56, priceY + 18, 122, 40, 2);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "700 21px Arial, sans-serif";
      context.textBaseline = "middle";
      context.fillText(`-${discount}%`, 78, priceY + 38);
    }

    context.fillStyle = "#ff6534";
    context.fillRect(8, 642, 704, 70);
    context.fillStyle = "rgba(255,255,255,.96)";
    roundedRect(context, 24, 654, 154, 48, 7);
    context.fill();
    if (siteLogo) drawContainedImage(context, siteLogo, { x: 34, y: 658, width: 134, height: 40 });
    drawStoreBrand(context, storeLogo, platform);

    productImage.close?.();
    siteLogo?.close?.();
    storeLogo?.close?.();
    return canvasBlob(canvas);
  }

  globalThis.TaBaratoArtwork = { createOfferArtwork };
})();
