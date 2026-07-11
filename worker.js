// Web Worker for high-performance RAW/Standard image preview extraction and compression
importScripts('./lib/exifreader.js');

self.onmessage = async function(e) {
  const { fileBuffer, name, quality } = e.data;
  const startTime = performance.now();
  const maxDim = 1920; // Locked standard 1080p resolution max dimension
  
  try {
    const fileBlob = new Blob([fileBuffer]);
    let imageBitmap = null;
    let previewBuffer = null;
    let isRaw = false;
    
    // 1. Try to load natively as standard image (JPEG, PNG, WebP, etc.)
    try {
      imageBitmap = await createImageBitmap(fileBlob);
      // For standard images, the "before" is the original file
      previewBuffer = fileBuffer.slice(0);
    } catch (nativeErr) {
      // 2. Native decoding failed, treat as RAW and try to extract embedded JPEG preview
      isRaw = true;
      const jpegData = extractLargestJpeg(fileBuffer);
      if (!jpegData) {
        throw new Error('Unsupported format or no embedded JPEG preview found.');
      }
      imageBitmap = await createImageBitmap(new Blob([jpegData], { type: 'image/jpeg' }));
      previewBuffer = jpegData.buffer.slice(jpegData.byteOffset, jpegData.byteOffset + jpegData.byteLength);
    }
    
    // 3. Parse EXIF metadata using the local ExifReader library
    let metadata = {};
    try {
      // Try parsing the original file first, fall back to extracted JPEG if it fails
      let tags;
      try {
        tags = ExifReader.load(fileBuffer);
      } catch (e) {
        tags = ExifReader.load(previewBuffer);
      }
      metadata = parseMetadata(tags);
    } catch (metaErr) {
      console.warn('Metadata parsing failed:', metaErr);
      metadata = { error: 'No metadata available' };
    }
    
    const extractionTime = performance.now();
    
    // 4. Resize and Compress using OffscreenCanvas (if supported)
    if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
      try {
        let width = imageBitmap.width;
        let height = imageBitmap.height;
        
        // Scale down to max 1920px (lock dimension for web/mobile/pc/tv viewing)
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0, width, height);
        
        // Convert to WebP
        const webpBlob = await canvas.convertToBlob({
          type: 'image/webp',
          quality: quality
        });
        
        const compressedBuffer = await webpBlob.arrayBuffer();
        const duration = performance.now() - startTime;
        
        self.postMessage({
          status: 'success',
          name: name,
          webpBuffer: compressedBuffer,
          previewBuffer: previewBuffer,
          originalSize: fileBuffer.byteLength,
          compressedSize: compressedBuffer.byteLength,
          metadata: metadata,
          dimensions: { original: { width: imageBitmap.width, height: imageBitmap.height }, compressed: { width, height } },
          timings: {
            extraction: extractionTime - startTime,
            compression: duration - extractionTime,
            total: duration
          }
        }, [compressedBuffer, previewBuffer]);
        
        imageBitmap.close();
        return;
      } catch (canvasErr) {
        console.warn('OffscreenCanvas compression failed in worker, falling back to main thread:', canvasErr);
      }
    }
    
    // Fallback: send the raw preview JPEG/original image bytes to the main thread for canvas compression
    const duration = performance.now() - startTime;
    self.postMessage({
      status: 'fallback',
      name: name,
      jpegBuffer: previewBuffer,
      originalSize: fileBuffer.byteLength,
      metadata: metadata,
      timings: {
        extraction: extractionTime - startTime,
        total: duration
      }
    }, [previewBuffer]);
    
  } catch (err) {
    self.postMessage({
      status: 'error',
      name: name,
      error: err.message
    });
  }
};

/**
 * Extracts the largest embedded JPEG within a RAW binary file buffer.
 */
function extractLargestJpeg(arrayBuffer) {
  const uint8 = new Uint8Array(arrayBuffer);
  const length = uint8.length;
  const candidates = [];
  
  let i = 0;
  // Scan for JPEG SOI marker (0xFFD8)
  while (i < length - 4) {
    if (uint8[i] === 0xFF && uint8[i+1] === 0xD8 && uint8[i+2] === 0xFF) {
      const start = i;
      let offset = i + 2;
      let foundEOI = false;
      
      // Parse JPEG segments to find the matching EOI marker (0xFFD9)
      while (offset < length - 1) {
        if (uint8[offset] === 0xFF) {
          const marker = uint8[offset + 1];
          
          if (marker === 0xD9) {
            offset += 2;
            foundEOI = true;
            break;
          } else if (marker === 0x00) {
            offset += 2;
          } else if (marker >= 0xD0 && marker <= 0xD7) {
            offset += 2;
          } else if (marker === 0xFF) {
            offset += 1;
          } else {
            if (offset + 3 < length) {
              const segLength = (uint8[offset + 2] << 8) | uint8[offset + 3];
              offset += 2 + segLength;
            } else {
              break;
            }
          }
        } else {
          offset++;
        }
      }
      
      if (foundEOI && offset > start + 100) {
        candidates.push({ start, end: offset, size: offset - start });
        i = offset;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  
  // Fallback: If no candidate was found using structural parsing, try a simple byte-search
  if (candidates.length === 0) {
    i = 0;
    while (i < length - 4) {
      if (uint8[i] === 0xFF && uint8[i+1] === 0xD8 && uint8[i+2] === 0xFF) {
        const start = i;
        let end = -1;
        for (let j = i + 2; j < length - 1; j++) {
          if (uint8[j] === 0xFF && uint8[j+1] === 0xD9) {
            end = j + 2;
            break;
          }
        }
        if (end !== -1 && end > start + 100) {
          candidates.push({ start, end, size: end - start });
          i = end;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
  }
  
  if (candidates.length === 0) {
    return null;
  }
  
  candidates.sort((a, b) => b.size - a.size);
  const best = candidates[0];
  return uint8.subarray(best.start, best.end);
}

/**
 * Normalizes the raw ExifReader tags into a clean JSON structure
 */
function parseMetadata(tags) {
  const result = {};
  
  const getTagValue = (tagName) => {
    if (tags[tagName]) {
      return tags[tagName].description || tags[tagName].value;
    }
    return null;
  };
  
  result.make = getTagValue('Make');
  result.model = getTagValue('Model');
  result.dateTime = getTagValue('DateTime') || getTagValue('DateTimeOriginal');
  result.exposureTime = getTagValue('ExposureTime');
  result.fNumber = getTagValue('FNumber');
  result.iso = getTagValue('ISOSpeedRatings') || getTagValue('ISO');
  result.focalLength = getTagValue('FocalLength');
  result.lens = getTagValue('LensModel') || getTagValue('LensInfo') || getTagValue('Lens');
  
  if (result.focalLength && typeof result.focalLength === 'string') {
    result.focalLength = result.focalLength.replace(/\s+/g, '');
  }
  
  if (result.exposureTime && typeof result.exposureTime === 'string') {
    if (!result.exposureTime.includes('/')) {
      const val = parseFloat(result.exposureTime);
      if (val > 0 && val < 1) {
        const fraction = Math.round(1 / val);
        result.exposureTime = `1/${fraction}`;
      }
    }
  }
  
  if (result.fNumber && typeof result.fNumber === 'string') {
    if (!result.fNumber.startsWith('f/')) {
      result.fNumber = `f/${result.fNumber}`;
    }
  }
  
  return result;
}
