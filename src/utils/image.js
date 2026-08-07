// Loads an image file, optionally center-crops it to a square, and downsizes it,
// returning a compressed JPEG data URL. Keeps localStorage small and stickers/avatars
// a sane, consistent size instead of dumping a raw multi-megapixel photo into the chat.
export function processImageFile(file, { square = false, maxSize = 800, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (square) {
          const side = Math.min(sw, sh);
          sx = (sw - side) / 2;
          sy = (sh - side) / 2;
          sw = side;
          sh = side;
        }
        const targetW = square ? maxSize : Math.min(maxSize, sw);
        const targetH = square ? maxSize : Math.round(sh * (targetW / sw));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
