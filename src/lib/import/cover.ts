import { EbookImportError } from "@/lib/import/types";

const MAX_COVER_WIDTH = 600;
const MAX_COVER_HEIGHT = 900;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new EbookImportError("无法读取封面数据"));
    };
    reader.onerror = () => reject(new EbookImportError("无法读取封面数据"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(blob: Blob): Promise<{ image: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new EbookImportError("封面图片格式无法识别"));
    };
    image.src = url;
  });
}

export async function resizeCoverToWebp(blob: Blob): Promise<string> {
  if (!blob.size) {
    throw new EbookImportError("封面内容为空");
  }

  const { image, url } = await loadImage(blob);

  try {
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;

    if (!naturalWidth || !naturalHeight) {
      throw new EbookImportError("无法读取封面尺寸");
    }

    const scale = Math.min(
      1,
      MAX_COVER_WIDTH / naturalWidth,
      MAX_COVER_HEIGHT / naturalHeight,
    );
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new EbookImportError("当前浏览器无法处理封面图片");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const webpBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
            return;
          }
          reject(new EbookImportError("当前浏览器不支持 WebP 封面"));
        },
        "image/webp",
        0.86,
      );
    });

    return readAsDataUrl(webpBlob);
  } finally {
    URL.revokeObjectURL(url);
  }
}
