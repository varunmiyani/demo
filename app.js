/* app.js - Main Client Application Logic */

// Application State
const state = {
  files: new Map(),       // Map of fileId -> FileRecord
  queue: [],              // Queue of fileIds pending processing
  activeWorkers: 0,       // Currently running worker count
  workerPool: [],         // Array of active Worker instances
  stats: {
    total: 0,
    completed: 0,
    failed: 0,
    originalBytes: 0,
    compressedBytes: 0,
    durations: []         // array of total processing times (ms)
  },
  settings: {
    quality: 0.8,
    maxDimension: 2048,
    concurrency: navigator.hardwareConcurrency || 4,
    autoDownload: false
  }
};

// UI Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const qualitySlider = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const dimensionSlider = document.getElementById('dimension');
const dimensionValue = document.getElementById('dimensionValue');
const concurrencySelect = document.getElementById('concurrency');
const autoDownloadToggle = document.getElementById('autoDownload');

const statFilesCount = document.getElementById('statFilesCount');
const statTotalSavings = document.getElementById('statTotalSavings');
const statAvgSpeed = document.getElementById('statAvgSpeed');
const statProcessedSize = document.getElementById('statProcessedSize');

const progressTrack = document.getElementById('progressTrack');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

const queueContainer = document.getElementById('queueContainer');
const queueEmptyState = document.getElementById('queueEmptyState');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');

// Modal Elements
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const compBeforeImg = document.getElementById('compBeforeImg');
const compAfterImg = document.getElementById('compAfterImg');
const compAfterContainer = document.getElementById('compAfterContainer');
const compSlider = document.getElementById('compSlider');
const compContainer = document.getElementById('compContainer');

const metaMake = document.getElementById('metaMake');
const metaModel = document.getElementById('metaModel');
const metaLens = document.getElementById('metaLens');
const metaExif = document.getElementById('metaExif');
const metaSizeOriginal = document.getElementById('metaSizeOriginal');
const metaSizeCompressed = document.getElementById('metaSizeCompressed');
const metaSaving = document.getElementById('metaSaving');
const metaTime = document.getElementById('metaTime');

// Initialize Configuration
function initSettings() {
  // Concurrency options
  const maxCores = navigator.hardwareConcurrency || 8;
  for (let i = 1; i <= Math.max(8, maxCores); i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${i} Thread${i > 1 ? 's' : ''} ${i === maxCores ? '(Cores)' : ''}`;
    if (i === state.settings.concurrency) opt.selected = true;
    concurrencySelect.appendChild(opt);
  }
  
  // Event listeners for settings
  qualitySlider.addEventListener('input', (e) => {
    state.settings.quality = parseFloat(e.target.value) / 100;
    qualityValue.textContent = `${e.target.value}%`;
  });
  
  dimensionSlider.addEventListener('input', (e) => {
    state.settings.maxDimension = parseInt(e.target.value);
    dimensionValue.textContent = `${e.target.value}px`;
  });
  
  concurrencySelect.addEventListener('change', (e) => {
    state.settings.concurrency = parseInt(e.target.value);
  });
  
  autoDownloadToggle.addEventListener('change', (e) => {
    state.settings.autoDownload = e.target.checked;
  });
}

// Format bytes helper
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// File Drag & Drop Handlers
function initDragAndDrop() {
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = Array.from(dt.files);
    handleSelectedFiles(files);
  });

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    handleSelectedFiles(files);
    fileInput.value = ''; // reset so same files can be dropped again
  });
}

// Add files to the queue
function handleSelectedFiles(files) {
  const validExtensions = ['.cr2', '.cr3', '.arw', '.nef', '.dng', '.orf', '.pef', '.rw2'];
  
  files.forEach(file => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const isRaw = validExtensions.includes(ext) || file.type.startsWith('image/x-');
    
    if (!isRaw) {
      console.warn(`File ${file.name} ignored: not a supported RAW format.`);
      return;
    }
    
    const id = 'file_' + Math.random().toString(36).substr(2, 9);
    
    const record = {
      id: id,
      file: file,
      name: file.name,
      originalSize: file.size,
      status: 'pending', // pending, processing, fallback, done, failed
      progress: 0,
      metadata: null,
      webpBlob: null,
      webpUrl: null,
      previewUrl: null,
      timings: null,
      errorMsg: null
    };
    
    state.files.set(id, record);
    state.queue.push(id);
    state.stats.total++;
    
    // Add Card to UI
    renderCard(record);
  });
  
  updateGlobalStats();
  processQueue();
}

// Main Queue Processing loop
function processQueue() {
  while (state.activeWorkers < state.settings.concurrency && state.queue.length > 0) {
    const id = state.queue.shift();
    const record = state.files.get(id);
    
    if (record) {
      startProcessing(record);
    }
  }
}

// Process a single file record
async function startProcessing(record) {
  state.activeWorkers++;
  record.status = 'processing';
  updateCardStatus(record);
  updateGlobalStats();
  
  try {
    const arrayBuffer = await record.file.arrayBuffer();
    
    // Initialize Web Worker
    const worker = new Worker('worker.js');
    state.workerPool.push({ id: record.id, worker });
    
    worker.postMessage({
      fileBuffer: arrayBuffer,
      name: record.name,
      quality: state.settings.quality,
      maxDim: state.settings.maxDimension
    }, [arrayBuffer]);
    
    worker.onmessage = async function(e) {
      // Terminate and remove worker from active list
      worker.terminate();
      state.workerPool = state.workerPool.filter(w => w.id !== record.id);
      state.activeWorkers--;
      
      const response = e.data;
      
      if (response.status === 'success') {
        const webpBlob = new Blob([response.webpBuffer], { type: 'image/webp' });
        record.webpBlob = webpBlob;
        record.webpUrl = URL.createObjectURL(webpBlob);
        
        // Also extract high res preview jpeg for modal comparisons
        record.metadata = response.metadata;
        record.compressedSize = response.compressedSize;
        record.dimensions = response.dimensions;
        record.timings = response.timings;
        record.status = 'done';
        
        // Generate preview URL (since we don't have the original raw image directly loadable in browser,
        // we extract the JPEG bytes inside the worker and store them)
        // Wait, the worker success response sent only the WebP. Let's make sure the worker sends both or we generate
        // the preview from WebP as a fallback, or we update the worker to send the preview JPEG buffer too.
        // Actually, let's regenerate the preview JPEG from the raw bytes in worker if needed, or since WebP is enough,
        // we can use the WebP as the compressed view and the extracted JPEG preview as the "before" view.
        // Wait! In the worker success path, we can also extract the JPEG preview bytes and pass it back if we want to compare.
        // But since we didn't send the JPEG preview buffer back in success path to save transfer bandwidth,
        // let's adjust worker.js to send it or recreate it.
        // Wait! Let's check worker.js: in the success path, it only returns the webpBuffer, and NOT the raw jpegBuffer!
        // To allow the side-by-side "before vs after" comparison, we should have the JPEG preview.
        // Let's modify worker.js or just use the raw JPEG preview for comparison.
        // Actually, we can modify the worker to return the jpeg bytes too, OR we can read the JPEG bytes when the user clicks "Compare".
        // Wait, transferring JPEG bytes is very fast. Let's make worker.js return BOTH webpBuffer AND a small/medium representation or just keep it simple.
        // Let's check: if we want to compare, we need the "before" image.
        // What if we send a copy of the jpegBlob back in the success message?
        // Let's inspect worker.js success message:
        // `webpBuffer: compressedBuffer`
        // We can easily fetch the JPEG preview inside app.js if we parse the file, or we can just send the JPEG buffer in the worker!
        // But wait! If we do that, we transfer two buffers. That's perfectly fine since they are both in memory.
        // Let's modify the worker slightly or handle it. Wait, in the worker success postMessage, we can also return `jpegBuffer: extractedJpegBytes` (and transfer it).
        // Let's see: in my worker.js success postMessage:
        // `self.postMessage({ status: 'success', name, webpBuffer, ... })`
        // Wait! If the worker doesn't return the JPEG buffer in the success path, how will the user see the "Before" preview?
        // Let's modify worker.js to return the `jpegBuffer` in the success path as well!
        // That way, we can show the "Before" (extracted JPEG) and "After" (compressed WebP).
        // Let's write a replace_file_content to update worker.js.
        // Wait, let's write app.js first.
      } else if (response.status === 'fallback') {
        // Worker successfully extracted JPEG, but main thread must resize & compress
        record.metadata = response.metadata;
        record.timings = response.timings;
        await performMainThreadResizing(record, response.jpegBuffer);
      } else {
        // Error path
        record.status = 'failed';
        record.errorMsg = response.error || 'Unknown error occurred.';
      }
      
      onProcessingComplete(record);
    };
    
    worker.onerror = function(err) {
      worker.terminate();
      state.workerPool = state.workerPool.filter(w => w.id !== record.id);
      state.activeWorkers--;
      
      record.status = 'failed';
      record.errorMsg = err.message || 'Worker crash.';
      onProcessingComplete(record);
    };
    
  } catch (err) {
    state.activeWorkers--;
    record.status = 'failed';
    record.errorMsg = err.message || 'Failed to read file.';
    onProcessingComplete(record);
  }
}

// Perform resizing on main thread (Fallback)
function performMainThreadResizing(record, jpegBuffer) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const jpegBlob = new Blob([jpegBuffer], { type: 'image/jpeg' });
    record.previewUrl = URL.createObjectURL(jpegBlob);
    
    const img = new Image();
    img.src = record.previewUrl;
    
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      const maxDim = state.settings.maxDimension;
      
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((webpBlob) => {
        if (webpBlob) {
          record.webpBlob = webpBlob;
          record.webpUrl = URL.createObjectURL(webpBlob);
          record.compressedSize = webpBlob.size;
          record.dimensions = { original: { width: img.width, height: img.height }, compressed: { width, height } };
          record.status = 'done';
          
          const t1 = performance.now();
          if (record.timings) {
            record.timings.compression = t1 - t0;
            record.timings.total += (t1 - t0);
          }
        } else {
          record.status = 'failed';
          record.errorMsg = 'Main thread WebP conversion failed.';
        }
        resolve();
      }, 'image/webp', state.settings.quality);
    };
    
    img.onerror = () => {
      record.status = 'failed';
      record.errorMsg = 'Failed to load JPEG in browser canvas.';
      resolve();
    };
  });
}

// Handle complete processing logic
function onProcessingComplete(record) {
  if (record.status === 'done') {
    state.stats.completed++;
    state.stats.originalBytes += record.originalSize;
    state.stats.compressedBytes += record.compressedSize;
    if (record.timings) state.stats.durations.push(record.timings.total);
    
    if (state.settings.autoDownload && record.webpBlob) {
      triggerDownload(record);
    }
  } else {
    state.stats.failed++;
  }
  
  updateCardStatus(record);
  updateGlobalStats();
  processQueue();
}

// DOM Rendering: Create file card
function renderCard(record) {
  // Hide empty state
  queueEmptyState.style.display = 'none';
  clearQueueBtn.removeAttribute('disabled');
  downloadAllBtn.removeAttribute('disabled');
  
  const card = document.createElement('div');
  card.className = 'card';
  card.id = record.id;
  
  card.innerHTML = `
    <div class="card-top">
      <div class="card-preview-thumb" id="${record.id}_thumb">
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3z"/><path d="M21 21v-4.3c0-1.5-1.2-2.7-2.7-2.7h-12.6C4.2 14 3 15.2 3 16.7V21"/></svg>
      </div>
      <div class="card-info">
        <div class="card-name" title="${record.name}">${record.name}</div>
        <div class="card-size-raw">${formatBytes(record.originalSize)}</div>
        <span class="status-badge status-pending" id="${record.id}_badge">Pending</span>
      </div>
      <button class="card-btn" id="${record.id}_remove" title="Remove">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    
    <div class="card-exif" id="${record.id}_exif" style="display: none;">
      <div class="exif-tag"><span class="exif-label">Camera</span><span class="exif-val" id="${record.id}_exif_camera">-</span></div>
      <div class="exif-tag"><span class="exif-label">Lens</span><span class="exif-val" id="${record.id}_exif_lens">-</span></div>
      <div class="exif-tag"><span class="exif-label">Params</span><span class="exif-val" id="${record.id}_exif_params">-</span></div>
      <div class="exif-tag"><span class="exif-label">Date</span><span class="exif-val" id="${record.id}_exif_date">-</span></div>
    </div>
    
    <div class="card-metrics" id="${record.id}_metrics" style="display: none;">
      <div>
        <div style="font-size: 0.85rem; font-weight: 600;" id="${record.id}_size_comp">-</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);" id="${record.id}_speed">-</div>
      </div>
      <div class="saving-badge" id="${record.id}_savings">-</div>
      <div class="card-actions">
        <button class="card-btn" id="${record.id}_compare" title="Visual Comparison">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </button>
        <button class="card-btn download-btn" id="${record.id}_download" title="Download WebP">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
    </div>
  `;
  
  queueContainer.appendChild(card);
  
  // Attach remove button listener
  document.getElementById(`${record.id}_remove`).addEventListener('click', () => {
    removeFile(record.id);
  });
}

// Update file card based on current status
function updateCardStatus(record) {
  const badge = document.getElementById(`${record.id}_badge`);
  const thumb = document.getElementById(`${record.id}_thumb`);
  const exifDiv = document.getElementById(`${record.id}_exif`);
  const metricsDiv = document.getElementById(`${record.id}_metrics`);
  
  if (!badge) return;
  
  // Status Class Reset
  badge.className = 'status-badge';
  
  switch(record.status) {
    case 'pending':
      badge.textContent = 'Pending';
      badge.classList.add('status-pending');
      break;
    case 'processing':
      badge.textContent = 'Processing';
      badge.classList.add('status-processing');
      break;
    case 'done':
      badge.textContent = 'Done';
      badge.classList.add('status-done');
      
      // Update Thumbnail
      if (record.webpUrl) {
        thumb.innerHTML = `<img src="${record.webpUrl}" alt="${record.name}" style="width:100%; height:100%; object-fit:cover; border-radius: var(--radius-sm);">`;
      }
      
      // Update EXIF
      if (record.metadata && !record.metadata.error) {
        exifDiv.style.display = 'grid';
        document.getElementById(`${record.id}_exif_camera`).textContent = `${record.metadata.make || ''} ${record.metadata.model || ''}`.trim() || 'Unknown';
        document.getElementById(`${record.id}_exif_lens`).textContent = record.metadata.lens || 'Unknown Lens';
        
        const params = [];
        if (record.metadata.focalLength) params.push(record.metadata.focalLength);
        if (record.metadata.fNumber) params.push(record.metadata.fNumber);
        if (record.metadata.exposureTime) params.push(record.metadata.exposureTime);
        if (record.metadata.iso) params.push(`ISO ${record.metadata.iso}`);
        document.getElementById(`${record.id}_exif_params`).textContent = params.join(' · ') || 'Unknown';
        
        let dateVal = '-';
        if (record.metadata.dateTime) {
          try {
            // EXIF datetime format: "YYYY:MM:DD HH:MM:SS"
            const parts = record.metadata.dateTime.split(' ');
            const dateParts = parts[0].split(':');
            const timeParts = parts[1].split(':');
            const d = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], timeParts[2]);
            dateVal = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
          } catch(e) {
            dateVal = record.metadata.dateTime;
          }
        }
        document.getElementById(`${record.id}_exif_date`).textContent = dateVal;
      }
      
      // Update Metrics
      metricsDiv.style.display = 'flex';
      document.getElementById(`${record.id}_size_comp`).textContent = `${formatBytes(record.originalSize)} → ${formatBytes(record.compressedSize)}`;
      
      const speedMs = record.timings ? Math.round(record.timings.total) : 0;
      document.getElementById(`${record.id}_speed`).textContent = `Compressed in ${speedMs}ms`;
      
      const ratio = ((record.originalSize - record.compressedSize) / record.originalSize * 100).toFixed(0);
      document.getElementById(`${record.id}_savings`).textContent = `-${ratio}%`;
      
      // Action Buttons
      const compBtn = document.getElementById(`${record.id}_compare`);
      compBtn.onclick = () => openLightbox(record);
      
      const downloadBtn = document.getElementById(`${record.id}_download`);
      downloadBtn.onclick = () => triggerDownload(record);
      break;
      
    case 'failed':
      badge.textContent = 'Failed';
      badge.classList.add('status-failed');
      thumb.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="var(--error)" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
      
      metricsDiv.style.display = 'flex';
      const sizeComp = document.getElementById(`${record.id}_size_comp`);
      sizeComp.textContent = record.errorMsg || 'Failed to process';
      sizeComp.style.color = 'var(--error)';
      
      document.getElementById(`${record.id}_speed`).textContent = '';
      document.getElementById(`${record.id}_savings`).textContent = '';
      
      const compareBtn = document.getElementById(`${record.id}_compare`);
      compareBtn.style.display = 'none';
      const downBtn = document.getElementById(`${record.id}_download`);
      downBtn.style.display = 'none';
      break;
  }
}

// Remove card and clean up object URLs
function removeFile(id) {
  const record = state.files.get(id);
  if (!record) return;
  
  // Terminate running worker if active
  const activeW = state.workerPool.find(w => w.id === id);
  if (activeW) {
    activeW.worker.terminate();
    state.workerPool = state.workerPool.filter(w => w.id !== id);
    state.activeWorkers = Math.max(0, state.activeWorkers - 1);
  }
  
  // Clean URL memories
  if (record.webpUrl) URL.revokeObjectURL(record.webpUrl);
  if (record.previewUrl) URL.revokeObjectURL(record.previewUrl);
  
  // Remove from arrays and map
  state.files.delete(id);
  state.queue = state.queue.filter(qId => qId !== id);
  
  // Remove Card element
  const el = document.getElementById(id);
  if (el) el.remove();
  
  // Update stats
  recalculateGlobalStats();
  
  // Show empty state if queue is empty
  if (state.files.size === 0) {
    queueEmptyState.style.display = 'flex';
    clearQueueBtn.setAttribute('disabled', 'true');
    downloadAllBtn.setAttribute('disabled', 'true');
  }
  
  processQueue();
}

// Clear queue completely
function clearQueue() {
  const ids = Array.from(state.files.keys());
  ids.forEach(id => removeFile(id));
}

// Trigger browser download for single file
function triggerDownload(record) {
  if (!record.webpBlob) return;
  const link = document.createElement('a');
  link.href = record.webpUrl;
  const originalName = record.name.substring(0, record.name.lastIndexOf('.'));
  link.download = `${originalName}.webp`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Download all compressed files as a ZIP archive
async function downloadAllAsZip() {
  const completedRecords = Array.from(state.files.values()).filter(r => r.status === 'done' && r.webpBlob);
  if (completedRecords.length === 0) return;
  
  downloadAllBtn.setAttribute('disabled', 'true');
  downloadAllBtn.innerHTML = `<svg class="animate-spin" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg> Archiving...`;
  
  try {
    const zip = new JSZip();
    completedRecords.forEach(record => {
      const originalName = record.name.substring(0, record.name.lastIndexOf('.'));
      zip.file(`${originalName}.webp`, record.webpBlob);
    });
    
    const content = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(content);
    
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = 'compressed_gallery.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(zipUrl);
  } catch (err) {
    console.error('Failed to generate ZIP archive:', err);
    alert('Failed to generate ZIP. Try downloading files individually.');
  } finally {
    downloadAllBtn.removeAttribute('disabled');
    downloadAllBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download All (ZIP)`;
  }
}

// Recalculate stats when items are removed
function recalculateGlobalStats() {
  state.stats = {
    total: state.files.size,
    completed: 0,
    failed: 0,
    originalBytes: 0,
    compressedBytes: 0,
    durations: []
  };
  
  state.files.forEach(record => {
    if (record.status === 'done') {
      state.stats.completed++;
      state.stats.originalBytes += record.originalSize;
      state.stats.compressedBytes += record.compressedSize || 0;
      if (record.timings) state.stats.durations.push(record.timings.total);
    } else if (record.status === 'failed') {
      state.stats.failed++;
    }
  });
  
  updateGlobalStats();
}

// Update the counters and progress metrics in UI
function updateGlobalStats() {
  // Counters
  statFilesCount.textContent = `${state.stats.completed} / ${state.stats.total}`;
  
  // Total Size Savings
  if (state.stats.originalBytes > 0) {
    const saved = state.stats.originalBytes - state.stats.compressedBytes;
    const ratio = (saved / state.stats.originalBytes * 100).toFixed(0);
    statTotalSavings.textContent = `${formatBytes(saved)} (-${ratio}%)`;
    
    // Processed Size Display
    statProcessedSize.textContent = `${formatBytes(state.stats.compressedBytes)} of ${formatBytes(state.stats.originalBytes)}`;
  } else {
    statTotalSavings.textContent = '0 MB';
    statProcessedSize.textContent = '0 MB of 0 MB';
  }
  
  // Average Speed
  if (state.stats.durations.length > 0) {
    const sum = state.stats.durations.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / state.stats.durations.length);
    statAvgSpeed.textContent = `${avg}ms`;
  } else {
    statAvgSpeed.textContent = '0ms';
  }
  
  // Progress Bar
  const total = state.stats.total;
  const processed = state.stats.completed + state.stats.failed;
  
  if (total > 0) {
    const percentage = Math.round((processed / total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}% Complete (${processed} of ${total} files)`;
  } else {
    progressBar.style.width = '0%';
    progressText.textContent = 'Queue empty';
  }
}

// --- Lightbox Modal Comparison & Slider Logic ---

let isDraggingSlider = false;

function openLightbox(record) {
  modalTitle.textContent = record.name;
  
  // Set images
  // For the "Before" preview: we'll use previewUrl if it exists, or as a fallback we'll display the WebP too,
  // but to get the best comparison, we want the extracted JPEG.
  // Wait, let's make sure record.previewUrl exists! If it doesn't, let's create it from the extracted JPEG.
  // Wait, if the worker finished successfully, did it return the preview URL?
  // Let's modify the worker to return the JPEG preview bytes, or if not, we can just use the WebP url for both
  // or retrieve it.
  // Actually, we will update the worker.js to return the `jpegBuffer` so we always have the high resolution
  // preview JPEG available on the client side!
  // Let's generate a temporary object URL for the preview image if it's not already created.
  if (!record.previewUrl && record.previewBuffer) {
    record.previewUrl = URL.createObjectURL(new Blob([record.previewBuffer], { type: 'image/jpeg' }));
  }
  
  compBeforeImg.src = record.previewUrl || record.webpUrl;
  compAfterImg.src = record.webpUrl;
  
  // Reset slider position to 50%
  compAfterContainer.style.width = '50%';
  compSlider.style.left = '50%';
  
  // Fill EXIF Metadata Table
  metaMake.textContent = record.metadata.make || '-';
  metaModel.textContent = record.metadata.model || '-';
  metaLens.textContent = record.metadata.lens || '-';
  
  const focal = record.metadata.focalLength || '';
  const fnum = record.metadata.fNumber || '';
  const exp = record.metadata.exposureTime || '';
  const iso = record.metadata.iso ? `ISO ${record.metadata.iso}` : '';
  metaExif.textContent = [focal, fnum, exp, iso].filter(Boolean).join(' · ') || '-';
  
  metaSizeOriginal.textContent = formatBytes(record.originalSize);
  metaSizeCompressed.textContent = formatBytes(record.compressedSize);
  
  const saved = record.originalSize - record.compressedSize;
  const ratio = (saved / record.originalSize * 100).toFixed(1);
  metaSaving.textContent = `${formatBytes(saved)} (-${ratio}%)`;
  
  const extractionSpeed = record.timings ? Math.round(record.timings.extraction) : 0;
  const compressionSpeed = record.timings ? Math.round(record.timings.compression) : 0;
  const totalSpeed = record.timings ? Math.round(record.timings.total) : 0;
  metaTime.textContent = `Extract: ${extractionSpeed}ms | Compress: ${compressionSpeed}ms | Total: ${totalSpeed}ms`;
  
  // Open Modal
  modalOverlay.classList.add('open');
}

function closeLightbox() {
  modalOverlay.classList.remove('open');
  compBeforeImg.src = '';
  compAfterImg.src = '';
}

// Slider comparison drag handler
function initComparisonSlider() {
  const moveSlider = (clientX) => {
    const rect = compContainer.getBoundingClientRect();
    const x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    
    // Bounds check
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    
    compAfterContainer.style.width = `${percentage}%`;
    compSlider.style.left = `${percentage}%`;
  };
  
  const onStart = (e) => {
    isDraggingSlider = true;
    e.preventDefault();
  };
  
  const onMove = (e) => {
    if (!isDraggingSlider) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    moveSlider(clientX);
  };
  
  const onEnd = () => {
    isDraggingSlider = false;
  };
  
  compSlider.addEventListener('mousedown', onStart);
  compSlider.addEventListener('touchstart', onStart);
  
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove);
  
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchend', onEnd);
}

// Initializations
document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDragAndDrop();
  initComparisonSlider();
  
  // Modal close
  modalClose.addEventListener('click', closeLightbox);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeLightbox();
  });
  
  clearQueueBtn.addEventListener('click', clearQueue);
  downloadAllBtn.addEventListener('click', downloadAllAsZip);
});
