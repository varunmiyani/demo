/* app.js - Simplified Real-time Image Compressor */

// Application State
const state = {
  activeFile: null,        // Ref to current File object
  activeQuality: 0.8,     // Current quality multiplier
  webpBlob: null,         // Result WebP blob
  webpUrl: null,          // Object URL for compressed image
  previewUrl: null,       // Object URL for original/preview image
  isProcessing: false,
  sliderDragging: false
};

// UI Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const errorBox = document.getElementById('errorBox');
const spinnerWrapper = document.getElementById('spinnerWrapper');
const spinnerText = document.getElementById('spinnerText');

const middleWorkspace = document.getElementById('middleWorkspace');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');

const compContainer = document.getElementById('compContainer');
const compBeforeImg = document.getElementById('compBeforeImg');
const compAfterImg = document.getElementById('compAfterImg');
const compAfterContainer = document.getElementById('compAfterContainer');
const compSlider = document.getElementById('compSlider');
const beforeLabel = document.getElementById('beforeLabel');

const statOriginalSize = document.getElementById('statOriginalSize');
const statCompressedSize = document.getElementById('statCompressedSize');
const statSavings = document.getElementById('statSavings');

const bottomActions = document.getElementById('bottomActions');
const downloadBtn = document.getElementById('downloadBtn');

// Helper to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Drag & Drop Setup
function initDragAndDrop() {
  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
      fileInput.value = ''; // Reset
    }
  });
}

// Handle file loading
function handleFile(file) {
  state.activeFile = file;
  showError('');
  
  // Set labels
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  const isRaw = ['.cr2', '.cr3', '.arw', '.nef', '.dng', '.orf', '.pef', '.rw2'].includes(ext) || file.type.startsWith('image/x-');
  beforeLabel.textContent = isRaw ? 'Extracted RAW Preview' : 'Original Image';

  compressActiveFile();
}

// Run compression pipeline using Web Worker
async function compressActiveFile() {
  if (!state.activeFile || state.isProcessing) return;
  
  state.isProcessing = true;
  showLoader(true, `Processing ${state.activeFile.name}...`);
  hideWorkspaces();
  
  try {
    // Read array buffer fresh every time so we don't have buffer transfer issues
    const fileBuffer = await state.activeFile.arrayBuffer();
    
    // Revoke previous URLs
    if (state.webpUrl) URL.revokeObjectURL(state.webpUrl);
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    
    const worker = new Worker('worker.js');
    worker.postMessage({
      fileBuffer: fileBuffer,
      name: state.activeFile.name,
      quality: state.activeQuality
    }, [fileBuffer]);
    
    worker.onmessage = async (e) => {
      worker.terminate();
      state.isProcessing = false;
      showLoader(false);
      
      const res = e.data;
      if (res.status === 'success') {
        // Success: OffscreenCanvas compressed the image in worker
        const webpBlob = new Blob([res.webpBuffer], { type: 'image/webp' });
        const previewBlob = new Blob([res.previewBuffer]);
        
        displayCompressedResult(webpBlob, previewBlob, res.originalSize, res.metadata);
      } else if (res.status === 'fallback') {
        // Fallback: Worker extracted preview, but canvas resize must run on main thread
        await runMainThreadCompression(res.jpegBuffer, res.originalSize, res.metadata);
      } else {
        // Error
        showError(res.error || 'Failed to process image.');
      }
    };
    
    worker.onerror = (err) => {
      worker.terminate();
      state.isProcessing = false;
      showLoader(false);
      showError(err.message || 'Worker encountered an error.');
    };
    
  } catch (err) {
    state.isProcessing = false;
    showLoader(false);
    showError(err.message || 'Failed to read file.');
  }
}

// Main thread compression fallback
function runMainThreadCompression(jpegBuffer, originalSize, metadata) {
  return new Promise((resolve) => {
    const jpegBlob = new Blob([jpegBuffer]);
    state.previewUrl = URL.createObjectURL(jpegBlob);
    
    const img = new Image();
    img.src = state.previewUrl;
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      const maxDim = 1920;
      
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
        state.isProcessing = false;
        showLoader(false);
        if (webpBlob) {
          displayCompressedResult(webpBlob, jpegBlob, originalSize, metadata);
        } else {
          showError('Main thread canvas compression failed.');
        }
        resolve();
      }, 'image/webp', state.activeQuality);
    };
    
    img.onerror = () => {
      state.isProcessing = false;
      showLoader(false);
      showError('Failed to load extracted image in browser preview.');
      resolve();
    };
  });
}

// Display results and populate UI elements
function displayCompressedResult(webpBlob, previewBlob, originalSize, metadata) {
  state.webpBlob = webpBlob;
  state.webpUrl = URL.createObjectURL(webpBlob);
  state.previewUrl = URL.createObjectURL(previewBlob);
  
  // Set images
  compBeforeImg.src = state.previewUrl;
  compAfterImg.src = state.webpUrl;
  
  // Reset split to 50%
  compAfterContainer.style.width = '50%';
  compSlider.style.left = '50%';
  
  // Update stats
  statOriginalSize.textContent = formatBytes(originalSize);
  statCompressedSize.textContent = formatBytes(webpBlob.size);
  
  const saved = originalSize - webpBlob.size;
  const ratio = Math.max(0, (saved / originalSize * 100)).toFixed(0);
  statSavings.textContent = `-${ratio}%`;
  
  // Display layout workspaces
  middleWorkspace.classList.add('active');
  bottomActions.classList.add('active');
}

// Handle errors
function showError(msg) {
  if (msg) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
  } else {
    errorBox.style.display = 'none';
  }
}

// Show loading state
function showLoader(show, text = 'Processing Image...') {
  if (show) {
    spinnerText.textContent = text;
    spinnerWrapper.style.display = 'flex';
  } else {
    spinnerWrapper.style.display = 'none';
  }
}

// Hide workspaces during transition
function hideWorkspaces() {
  middleWorkspace.classList.remove('active');
  bottomActions.classList.remove('active');
}

// Visual swipe slider drag logic
function initComparisonSlider() {
  const moveSlider = (clientX) => {
    const rect = compContainer.getBoundingClientRect();
    const x = clientX - rect.left;
    let pct = (x / rect.width) * 100;
    
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    
    compAfterContainer.style.width = `${pct}%`;
    compSlider.style.left = `${pct}%`;
  };
  
  const onStart = (e) => {
    state.sliderDragging = true;
    e.preventDefault();
  };
  
  const onMove = (e) => {
    if (!state.sliderDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    moveSlider(clientX);
  };
  
  const onEnd = () => {
    state.sliderDragging = false;
  };
  
  compSlider.addEventListener('mousedown', onStart);
  compSlider.addEventListener('touchstart', onStart);
  
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove);
  
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchend', onEnd);
}

// Initialize quality slider change listeners
function initQualitySlider() {
  // Update quality display badge in real-time as they slide
  qualitySlider.addEventListener('input', (e) => {
    qualityValue.textContent = `${e.target.value}%`;
  });
  
  // Trigger compression only when they release/finish sliding (improves responsiveness)
  qualitySlider.addEventListener('change', (e) => {
    state.activeQuality = parseFloat(e.target.value) / 100;
    compressActiveFile();
  });
}

// Trigger single file download
function triggerDownload() {
  if (!state.webpUrl || !state.activeFile) return;
  
  const link = document.createElement('a');
  link.href = state.webpUrl;
  
  const originalName = state.activeFile.name;
  const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
  link.download = `${baseName}_compressed.webp`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Initialization on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initDragAndDrop();
  initComparisonSlider();
  initQualitySlider();
  
  downloadBtn.addEventListener('click', triggerDownload);
});
