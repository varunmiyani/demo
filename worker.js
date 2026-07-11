// Web Worker for high-performance RAW image preview extraction and compression
importScripts('./lib/exifreader.js');

self.onmessage = async function(e) {
  const { fileBuffer, name, quality, maxDim } = e.data;
  const startTime = performance.now();
  
  try {
    // 1. Extract embedded JPEG preview from the RAW file buffer
    const jpegData = extractLargestJpeg(fileBuffer);
    if (!jpegData) {
      throw new Error('No embedded JPEG preview found in the RAW file.');
    }
    
    // 2. Parse EXIF metadata using the local ExifReader library
    let metadata = {};
    try {
      // ExifReader.load expects a Uint8Array or ArrayBuffer
      const tags = ExifReader.load(jpegData);
      metadata = parseMetadata(tags);
    } catch (metaErr) {
      console.warn('Metadata parsing failed:', metaErr);
      metadata = { error: 'Failed to parse metadata' };
    }
    
    const extractionTime = performance.now();
    const jpegBlob = new Blob([jpegData], { type: 'image/jpeg' });
    
    // 3. Resize and Compress using OffscreenCanvas (if supported)
    if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
      try {
        const imageBitmap = await createImageBitmap(jpegBlob);
        
        // Calculate new dimensions (maintain aspect ratio, cap max dimension at maxDim)
        let width = imageBitmap.width;
        let height = imageBitmap.height;
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
        
        // Extract a clean ArrayBuffer of the preview JPEG to return for comparison
        const previewBuffer = jpegData.buffer.slice(jpegData.byteOffset, jpegData.byteOffset + jpegData.byteLength);
        
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
        
        // Clean up resources
        imageBitmap.close();
        return;
      } catch (canvasErr) {
        console.warn('OffscreenCanvas compression failed in worker, falling back to main thread:', canvasErr);
      }
    }
    
    // Fallback: send the raw extracted JPEG bytes to the main thread for UI-thread rendering/resizing
    const duration = performance.now() - startTime;
    const jpegArrayBuffer = await jpegBlob.arrayBuffer();
    self.postMessage({
      status: 'fallback',
      name: name,
      jpegBuffer: jpegArrayBuffer,
      originalSize: fileBuffer.byteLength,
      metadata: metadata,
      timings: {
        extraction: extractionTime - startTime,
        total: duration
      }
    }, [jpegArrayBuffer]);
    
  } catch (err) {
    self.postMessage({
      status: 'error',
      name: name,
      error: err.message
    });
  }
};

/**
 * Parses and returns the largest embedded JPEG within a RAW binary file buffer.
 * It uses a fast JPEG marker-skipping algorithm to scan segments correctly,
 * and falls back to a simpler scan if the structure is atypical.
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
            // End of Image marker
            offset += 2;
            foundEOI = true;
            break;
          } else if (marker === 0x00) {
            // Byte stuffing: 0xFF00 inside scan data, skip
            offset += 2;
          } else if (marker >= 0xD0 && marker <= 0xD7) {
            // RST markers (no length fields)
            offset += 2;
          } else if (marker === 0xFF) {
            // Multiple 0xFFs in a row (allowed as fill bytes)
            offset += 1;
          } else {
            // Marker with length header
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
        i = offset; // Jump past this JPEG to continue scanning
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
        // Simple search for next 0xFFD9
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
  
  // Return the largest candidate (the high-resolution preview rather than a tiny thumbnail)
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
  
  // Clean up focal length (e.g. "50 mm" -> "50mm")
  if (result.focalLength && typeof result.focalLength === 'string') {
    result.focalLength = result.focalLength.replace(/\s+/g, '');
  }
  
  // Format exposure time (e.g., "1/250" or "0.004" -> fraction format if possible)
  if (result.exposureTime && typeof result.exposureTime === 'string') {
    if (!result.exposureTime.includes('/')) {
      const val = parseFloat(result.exposureTime);
      if (val > 0 && val < 1) {
        const fraction = Math.round(1 / val);
        result.exposureTime = `1/${fraction}`;
      }
    }
  }
  
  // Format F-number (e.g., "f/2.8")
  if (result.fNumber && typeof result.fNumber === 'string') {
    if (!result.fNumber.startsWith('f/')) {
      result.fNumber = `f/${result.fNumber}`;
    }
  }
  
  return result;
}
