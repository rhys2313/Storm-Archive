// Image processing for Storm Archive photos.
//
// Photos are persisted as JPEG data URLs so that a single JSON export contains
// the whole archive and so that the same code path works in a browser, in an
// installed PWA on Windows and in an Android WebView.
//
// Every stored photo carries two encodings:
//   url   - the archive-quality image shown in the lightbox
//   thumb - a small preview used by every grid and list in the UI
//
// Grids never touch `url`, which keeps memory and decode cost low even when an
// archive holds hundreds of photos.

export const FULL_MAX_SIDE = 1600;
export const FULL_QUALITY = 0.8;
export const THUMB_MAX_SIDE = 400;
export const THUMB_QUALITY = 0.62;

const canUseImageBitmap = () => typeof createImageBitmap === 'function';

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });

/** Upper bound for a single decode, so a stalled image cannot hang a save. */
export const DECODE_TIMEOUT_MS = 20000;

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => {
      img.src = '';
      reject(new Error('Истекло время декодирования изображения'));
    }, DECODE_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Не удалось декодировать изображение'));
    };
    img.src = src;
  });

/**
 * Loads any image source into something with intrinsic width/height that
 * canvas can draw. Prefers createImageBitmap (off-main-thread decode) and
 * falls back to an HTMLImageElement where it is unavailable.
 */
const decodeSource = async (source) => {
  if (canUseImageBitmap()) {
    try {
      const bitmap = await createImageBitmap(source instanceof Blob ? source : await (await fetch(source)).blob());
      return { drawable: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Falls through to the <img> path below (e.g. jsdom, older WebViews).
    }
  }
  const src = source instanceof Blob ? await readAsDataUrl(source) : source;
  const img = await loadImageElement(src);
  return {
    drawable: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    release: () => {}
  };
};

const drawToDataUrl = (decoded, maxSide, quality) => {
  const largestSide = Math.max(decoded.width, decoded.height);
  const scale = largestSide > 0 ? Math.min(1, maxSide / largestSide) : 1;
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D недоступен');
  // A solid backdrop keeps transparent PNGs from turning black in JPEG.
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(decoded.drawable, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  // Free the backing store eagerly; Android WebViews are slow to reclaim it.
  canvas.width = 0;
  canvas.height = 0;
  if (!dataUrl || dataUrl === 'data:,') throw new Error('Не удалось закодировать изображение');
  return dataUrl;
};

/**
 * Turns a user-selected file into the stored photo payload.
 * Never throws: if decoding fails the original file is kept as-is so the user
 * does not silently lose a photo.
 */
export const preparePhotoFromFile = async (file) => {
  try {
    const decoded = await decodeSource(file);
    try {
      const url = drawToDataUrl(decoded, FULL_MAX_SIDE, FULL_QUALITY);
      const thumb = drawToDataUrl(decoded, THUMB_MAX_SIDE, THUMB_QUALITY);
      return { url, thumb, width: decoded.width, height: decoded.height };
    } finally {
      decoded.release();
    }
  } catch (err) {
    console.warn('Photo processing failed, storing original file:', err);
    const url = await readAsDataUrl(file);
    return { url, thumb: null, width: null, height: null };
  }
};

/**
 * Re-encodes an existing data URL at a smaller size. Used when the storage
 * quota is exceeded so that saving still succeeds with smaller photos, and to
 * backfill thumbnails for archives created before thumbnails existed.
 * Resolves with the original value if it cannot be processed.
 */
export const resizeDataUrl = async (dataUrl, maxSide, quality) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) return dataUrl;
  try {
    const decoded = await decodeSource(dataUrl);
    try {
      return drawToDataUrl(decoded, maxSide, quality);
    } finally {
      decoded.release();
    }
  } catch (err) {
    console.warn('Could not resize data URL:', err);
    return dataUrl;
  }
};

/** Preview source for grids and lists, with a fallback for legacy photos. */
export const photoPreviewSrc = (photo) => photo?.thumb || photo?.url || '';

/** Full-resolution source for the lightbox. */
export const photoFullSrc = (photo) => photo?.url || photo?.thumb || '';
