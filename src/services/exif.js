// exifr is only needed when the user actually attaches a photo, so it is loaded
// on demand instead of being part of the initial bundle.
let exifrPromise = null;
const loadExifr = () => {
  if (!exifrPromise) {
    exifrPromise = import('exifr').then(module => module.default || module);
  }
  return exifrPromise;
};

/**
 * Formats a Date as the `YYYY-MM-DDTHH:mm` string expected by
 * `<input type="datetime-local">`.
 *
 * EXIF DateTimeOriginal is wall-clock time without a timezone, and exifr
 * returns it as a local Date. Serialising via toISOString() would shift it by
 * the UTC offset and show the wrong time of day, so the local calendar fields
 * are used directly.
 */
export const toDateTimeLocalValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatExposure = (exposureTime) => {
  if (typeof exposureTime !== 'number' || !Number.isFinite(exposureTime) || exposureTime <= 0) return null;
  // Storm photography routinely uses both fast and multi-second exposures.
  if (exposureTime >= 1) return `${Number(exposureTime.toFixed(1))}s`;
  return `1/${Math.round(1 / exposureTime)}s`;
};

const formatFocalLength = (focalLength) => {
  if (typeof focalLength !== 'number' || !Number.isFinite(focalLength)) return null;
  return `${Number(focalLength.toFixed(1))}mm`;
};

const formatAperture = (fNumber) => {
  if (typeof fNumber !== 'number' || !Number.isFinite(fNumber) || fNumber <= 0) return null;
  return `f/${Number(fNumber.toFixed(1))}`;
};

const formatIso = (iso) => {
  const value = Array.isArray(iso) ? iso[0] : iso;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `ISO ${Math.round(value)}`;
};

const isValidLatitude = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 90;
const isValidLongitude = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 180;

/**
 * Reads shooting date, GPS position and camera settings from a photo.
 * Never throws: files without EXIF (PNG, WebP, screenshots, stripped JPEG)
 * are common and must not interrupt the upload flow.
 */
export const parsePhotoMetadata = async (file) => {
  const empty = { date: null, lat: null, lng: null, exif: {} };

  let exifData = null;
  try {
    const exifr = await loadExifr();
    exifData = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude', 'Make', 'Model', 'FocalLength', 'ISO', 'FNumber', 'ExposureTime']
    });
  } catch (err) {
    console.warn('EXIF parsing skipped or failed:', err);
    return empty;
  }

  if (!exifData) return empty;

  const rawDate = exifData.DateTimeOriginal || exifData.CreateDate;
  const date = rawDate ? toDateTimeLocalValue(rawDate instanceof Date ? rawDate : new Date(rawDate)) : null;

  // Latitude 0 / longitude 0 are valid positions, so presence is checked by
  // type and range rather than truthiness.
  const hasCoords = isValidLatitude(exifData.latitude) && isValidLongitude(exifData.longitude);

  const camera = [exifData.Make, exifData.Model]
    .filter(part => typeof part === 'string' && part.trim())
    .map(part => part.trim())
    .join(' ')
    .trim() || null;

  return {
    date,
    lat: hasCoords ? Number(exifData.latitude.toFixed(6)) : null,
    lng: hasCoords ? Number(exifData.longitude.toFixed(6)) : null,
    exif: {
      camera,
      focalLength: formatFocalLength(exifData.FocalLength),
      iso: formatIso(exifData.ISO),
      aperture: formatAperture(exifData.FNumber),
      exposure: formatExposure(exifData.ExposureTime)
    }
  };
};
