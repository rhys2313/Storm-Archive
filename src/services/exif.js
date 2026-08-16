import exifr from 'exifr';

export const parsePhotoMetadata = async (file) => {
  try {
    const exifData = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude', 'Make', 'Model', 'FocalLength', 'ISO', 'FNumber', 'ExposureTime']
    });

    let extractedDate = null;
    let extractedLat = null;
    let extractedLng = null;
    let camera = null;
    let details = {};

    if (exifData) {
      if (exifData.DateTimeOriginal || exifData.CreateDate) {
        const rawDate = exifData.DateTimeOriginal || exifData.CreateDate;
        try {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) {
            // YYYY-MM-DDTHH:mm
            const isoStr = d.toISOString();
            extractedDate = isoStr.slice(0, 16);
          }
        } catch (e) {
          console.warn('Date parsing error', e);
        }
      }

      if (typeof exifData.latitude === 'number' && typeof exifData.longitude === 'number') {
        extractedLat = parseFloat(exifData.latitude.toFixed(6));
        extractedLng = parseFloat(exifData.longitude.toFixed(6));
      }

      if (exifData.Make || exifData.Model) {
        camera = [exifData.Make, exifData.Model].filter(Boolean).join(' ');
      }

      details = {
        camera,
        focalLength: exifData.FocalLength ? `${exifData.FocalLength}mm` : null,
        iso: exifData.ISO ? `ISO ${exifData.ISO}` : null,
        aperture: exifData.FNumber ? `f/${exifData.FNumber}` : null,
        exposure: exifData.ExposureTime ? `${exifData.ExposureTime}s` : null
      };
    }

    return {
      date: extractedDate,
      lat: extractedLat,
      lng: extractedLng,
      exif: details
    };
  } catch (err) {
    console.warn('EXIF parsing skipped or failed:', err);
    return { date: null, lat: null, lng: null, exif: {} };
  }
};
