/**
 * Prepare a picked image for editing: check the type, then shrink it in the browser.
 * The edit works at about half a megapixel, so sending more only makes the request
 * (and the saved conversation) bigger. Runs client-side only.
 */

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const TARGET_PIXELS = 600_000;

export class ImageError extends Error {}

export type PreparedImage = {
  dataUrl: string;
  mediaType: "image/jpeg";
  width: number;
  height: number;
  name: string;
};

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new ImageError("Use a PNG, JPEG or WebP image.");
  }
  if (file.size > MAX_INPUT_BYTES) throw new ImageError("That image is larger than 25 MB.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("That image could not be read.");
  }

  const scale = Math.min(1, Math.sqrt(TARGET_PIXELS / (bitmap.width * bitmap.height)));
  const width = Math.max(64, Math.round(bitmap.width * scale));
  const height = Math.max(64, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("Your browser could not process that image.");
  // JPEG has no alpha: flatten transparent PNGs onto white instead of black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.88),
    mediaType: "image/jpeg",
    width,
    height,
    name: file.name || "image",
  };
}
