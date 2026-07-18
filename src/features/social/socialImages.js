export function imageFileToDataUrl(file, { maxWidth = 1200, maxHeight = 1200, quality = 0.86 } = {}) {
  if (!file) return Promise.resolve("");
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) return Promise.reject(new Error("Use uma imagem PNG, JPG ou WebP."));

  return new Promise((resolve, reject) => {
    const image = new Image();
    const source = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(source);
      const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const output = canvas.toDataURL("image/webp", quality);
      if (output.length > 900_000) reject(new Error("A imagem ficou muito grande. Escolha um arquivo menor."));
      else resolve(output);
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      reject(new Error("Não foi possível processar a imagem."));
    };
    image.src = source;
  });
}
