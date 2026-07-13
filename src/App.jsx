import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  // App State
  const [file, setFile] = useState(null);
  const [originalUrl, setOriginalUrl] = useState(null);
  const [compressedBlob, setCompressedBlob] = useState(null);
  const [compressedUrl, setCompressedUrl] = useState(null);
  
  const [quality, setQuality] = useState(80); // percentage (10-100)
  const [debouncedQuality, setDebouncedQuality] = useState(80);
  const [preset, setPreset] = useState('original'); // 'original' | 'medium' | 'thumbnail'
  const [originalResPreset, setOriginalResPreset] = useState('original'); // 'original' | '4k' | '2k'
  const [outputFormat, setOutputFormat] = useState('webp'); // 'webp' | 'jpeg'
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  // Performance and comparison metrics
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState(0);
  const [originalDims, setOriginalDims] = useState({ width: 0, height: 0 });
  const [compressedDims, setCompressedDims] = useState({ width: 0, height: 0 });
  const [encodingTime, setEncodingTime] = useState(0);
  
  // Slider state
  const [sliderPos, setSliderPos] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Debounce quality changes so we don't re-compress on every single slider tick
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuality(quality);
    }, 200);
    return () => clearTimeout(handler);
  }, [quality]);

  // Clean up Object URLs when file changes or unmounts
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (compressedUrl) URL.revokeObjectURL(compressedUrl);
    };
  }, [originalUrl, compressedUrl]);

  // Handle image compression when variables change
  useEffect(() => {
    if (!file) return;
    performCompression();
  }, [file, preset, originalResPreset, outputFormat, debouncedQuality]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processSelectedFile(selectedFile);
    }
  };

  const processSelectedFile = (selectedFile) => {
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPEG, PNG, WebP).');
      return;
    }
    setError(null);
    setFile(selectedFile);
    setOriginalSize(selectedFile.size);
    
    // Create preview URL for original
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    const url = URL.createObjectURL(selectedFile);
    setOriginalUrl(url);
  };

  const performCompression = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    
    try {
      const qValue = debouncedQuality / 100;
      const res = await compressImage(file, qValue, preset, originalResPreset, outputFormat);
      
      setCompressedSize(res.blob.size);
      setOriginalDims(res.originalDimensions);
      setCompressedDims(res.dimensions);
      setEncodingTime(res.encodingTime);
      setCompressedBlob(res.blob);

      // Create URL for compressed preview
      if (compressedUrl) URL.revokeObjectURL(compressedUrl);
      const url = URL.createObjectURL(res.blob);
      setCompressedUrl(url);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to compress image.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Canvas Image Compression logic
  const compressImage = (imageFile, qualityVal, sizePreset, resPreset, format) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(imageFile);
      
      img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;
        
        let targetWidth = originalWidth;
        let targetHeight = originalHeight;
        
        // Define limits for presets
        let maxDim = null;
        
        if (sizePreset === 'thumbnail') {
          maxDim = 300; // Small preview thumbnail
        } else if (sizePreset === 'medium') {
          maxDim = 1920; // Medium Web view
        } else if (sizePreset === 'original') {
          // Check resolution restrictions for Original preset
          if (resPreset === '4k') {
            maxDim = 3840;
          } else if (resPreset === '2k') {
            maxDim = 2048;
          }
        }
        
        // Apply downscaling proportionally to respect original aspect ratio (Portrait or Landscape)
        if (maxDim && (originalWidth > maxDim || originalHeight > maxDim)) {
          if (originalWidth > originalHeight) {
            // Landscape orientation: restrict width, compute height
            targetWidth = maxDim;
            targetHeight = Math.round((originalHeight * maxDim) / originalWidth);
          } else {
            // Portrait orientation: restrict height, compute width
            targetHeight = maxDim;
            targetWidth = Math.round((originalWidth * maxDim) / originalHeight);
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        // Anti-aliasing configuration
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw the image
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        // Output mime-type
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
        
        const startTime = performance.now();
        canvas.toBlob(
          (blob) => {
            const endTime = performance.now();
            URL.revokeObjectURL(objectUrl);
            if (blob) {
              resolve({
                blob,
                dimensions: { width: targetWidth, height: targetHeight },
                originalDimensions: { width: originalWidth, height: originalHeight },
                encodingTime: Math.round(endTime - startTime)
              });
            } else {
              reject(new Error(`Canvas ${format.toUpperCase()} encoding failed.`));
            }
          },
          mimeType,
          qualityVal
        );
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image into browser memory.'));
      };
      
      img.src = objectUrl;
    });
  };

  // Before/after comparison slider dragging handlers
  const handleSliderStart = (clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    setSliderPos(Math.max(0, Math.min(100, (x / rect.width) * 100)));
    setIsDraggingSlider(true);
  };

  const handleSliderMove = (clientX) => {
    if (!isDraggingSlider || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    setSliderPos(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  };

  useEffect(() => {
    const handleMouseUp = () => setIsDraggingSlider(false);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, []);

  // Drag & drop dropzone events
  const [isDragOver, setIsDragOver] = useState(false);
  
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processSelectedFile(droppedFile);
    }
  };

  // Helper formats
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSavingsPercentage = () => {
    if (!originalSize || !compressedSize) return 0;
    const savings = ((originalSize - compressedSize) / originalSize) * 100;
    return savings > 0 ? Math.round(savings) : 0;
  };

  const downloadCompressed = () => {
    if (!compressedBlob || !file) return;
    const originalName = file.name.substring(0, file.name.lastIndexOf('.'));
    const extension = outputFormat === 'jpeg' ? 'jpg' : 'webp';
    const downloadLink = document.createElement('a');
    downloadLink.href = compressedUrl;
    downloadLink.download = `${originalName}_compressed.${extension}`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const triggerUploadClick = () => {
    fileInputRef.current?.click();
  };

  const resetUploader = () => {
    setFile(null);
    setOriginalUrl(null);
    setCompressedBlob(null);
    setCompressedUrl(null);
    setOriginalSize(0);
    setCompressedSize(0);
    setOriginalDims({ width: 0, height: 0 });
    setCompressedDims({ width: 0, height: 0 });
    setEncodingTime(0);
    setError(null);
  };

  return (
    <div className="app-layout">
      {/* Background Gradients */}
      <div className="glow-bg-primary"></div>
      <div className="glow-bg-secondary"></div>

      <header className="app-header">
        <div className="brand">
          <div className="brand-dot"></div>
          <h1>Studio-OS <span>WebP & JPEG Compressor</span></h1>
        </div>
        <p className="brand-subtitle">High-performance browser image compressor for photographers</p>
      </header>

      <main className="app-container">
        {!file ? (
          /* Initial State: Dropzone */
          <div className="initial-upload-view">
            <div 
              className={`dropzone-card ${isDragOver ? 'dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerUploadClick}
              id="dropzone"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/jpeg, image/png, image/webp" 
                style={{ display: 'none' }}
                id="fileInput"
              />
              <div className="dropzone-icon">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <h3>Drag & drop your High-Res image here</h3>
              <p>Supports JPEG, PNG, and WebP (up to 50MB files)</p>
              <button className="btn-primary select-file-btn">Choose File</button>
            </div>

            {/* Info Cards */}
            <div className="info-grid">
              <div className="info-card">
                <h4>100% Client-Side</h4>
                <p>Images never touch the cloud. Your local CPU processes everything in the browser for maximum security and zero bandwidth cost.</p>
              </div>
              <div className="info-card">
                <h4>Predictive & Block Formats</h4>
                <p>Output next-gen WebP or universal JPEG formats. Quality settings are handled locally at hardware level in milliseconds.</p>
              </div>
              <div className="info-card">
                <h4>Pro Aspect Preservation</h4>
                <p>Portrait and landscape dimensions are auto-detected. Scales images cleanly without stretching or squeezing pixels.</p>
              </div>
            </div>
          </div>
        ) : (
          /* Active State: Workspace */
          <div className="workspace-grid">
            
            {/* Left Panel: Compression Controls */}
            <div className="panel-controls">
              <div className="card glass-card">
                <div className="card-header">
                  <h3>Compression Settings</h3>
                  <button className="btn-secondary btn-small" onClick={resetUploader}>
                    Upload New
                  </button>
                </div>
                
                {/* File details */}
                <div className="file-info-badge">
                  <div className="file-info-text">
                    <span className="file-name" title={file.name}>{file.name}</span>
                    <span className="file-meta">{formatBytes(file.size)}</span>
                  </div>
                </div>

                {/* Control Group: Format Selector */}
                <div className="control-group">
                  <label className="control-label">
                    <span>Output format</span>
                  </label>
                  <div className="presets-toggle">
                    <button 
                      className={`preset-btn ${outputFormat === 'webp' ? 'active' : ''}`}
                      onClick={() => setOutputFormat('webp')}
                    >
                      <span className="preset-name">WebP</span>
                      <span className="preset-size">Next-Gen</span>
                    </button>
                    <button 
                      className={`preset-btn ${outputFormat === 'jpeg' ? 'active' : ''}`}
                      onClick={() => setOutputFormat('jpeg')}
                    >
                      <span className="preset-name">JPEG</span>
                      <span className="preset-size">Universal</span>
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <label className="control-label">
                    <span>Compression Quality</span>
                    <span className="badge-value">{quality}%</span>
                  </label>
                  <div className="slider-wrapper">
                    <input 
                      type="range" 
                      min="10" 
                      max="100" 
                      value={quality} 
                      onChange={(e) => setQuality(parseInt(e.target.value))}
                      className="quality-slider"
                      id="qualitySlider"
                    />
                    <div className="slider-ticks">
                      <span>High Comp.</span>
                      <span>Balanced</span>
                      <span>Best Quality</span>
                    </div>
                  </div>
                </div>

                <div className="control-group">
                  <label className="control-label">
                    <span>Output Size Preset</span>
                  </label>
                  <div className="presets-toggle">
                    <button 
                      className={`preset-btn ${preset === 'thumbnail' ? 'active' : ''}`}
                      onClick={() => setPreset('thumbnail')}
                    >
                      <span className="preset-name">Thumbnail</span>
                      <span className="preset-size">Max 300px</span>
                    </button>
                    <button 
                      className={`preset-btn ${preset === 'medium' ? 'active' : ''}`}
                      onClick={() => setPreset('medium')}
                    >
                      <span className="preset-name">Medium</span>
                      <span className="preset-size">Max 1920px</span>
                    </button>
                    <button 
                      className={`preset-btn ${preset === 'original' ? 'active' : ''}`}
                      onClick={() => setPreset('original')}
                    >
                      <span className="preset-name">Original</span>
                      <span className="preset-size">Full Size</span>
                    </button>
                  </div>
                </div>

                {/* Sub Resolution Preset for Original Output */}
                {preset === 'original' && (
                  <div className="control-group animate-fade-in">
                    <label className="control-label">
                      <span>Original Dimension Limit</span>
                    </label>
                    <div className="presets-toggle">
                      <button 
                        className={`preset-btn ${originalResPreset === 'original' ? 'active' : ''}`}
                        onClick={() => setOriginalResPreset('original')}
                      >
                        <span className="preset-name">Full Size</span>
                        <span className="preset-size">No Scale</span>
                      </button>
                      <button 
                        className={`preset-btn ${originalResPreset === '4k' ? 'active' : ''}`}
                        onClick={() => setOriginalResPreset('4k')}
                      >
                        <span className="preset-name">4K Preset</span>
                        <span className="preset-size">Max 3840px</span>
                      </button>
                      <button 
                        className={`preset-btn ${originalResPreset === '2k' ? 'active' : ''}`}
                        onClick={() => setOriginalResPreset('2k')}
                      >
                        <span className="preset-name">2K Preset</span>
                        <span className="preset-size">Max 2048px</span>
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="alert alert-error">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>{error}</span>
                  </div>
                )}

                <div className="action-row">
                  <button 
                    className="btn-primary btn-large btn-download" 
                    onClick={downloadCompressed}
                    disabled={isProcessing || !compressedUrl}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download {outputFormat.toUpperCase()} Image
                  </button>
                </div>
              </div>

              {/* Statistics Card */}
              <div className="card glass-card stats-card">
                <h3>Compression Metrics</h3>
                
                <div className="stats-list">
                  <div className="stat-item">
                    <span className="stat-label">Original Dimensions</span>
                    <span className="stat-val">{originalDims.width} × {originalDims.height} px</span>
                  </div>
                  
                  <div className="stat-item">
                    <span className="stat-label">Compressed Dimensions</span>
                    <span className="stat-val">{compressedDims.width} × {compressedDims.height} px</span>
                  </div>

                  <div className="stat-item">
                    <span className="stat-label">Original Size</span>
                    <span className="stat-val">{formatBytes(originalSize)}</span>
                  </div>

                  <div className="stat-item">
                    <span className="stat-label">Compressed Size ({outputFormat.toUpperCase()})</span>
                    <span className="stat-val Highlight">{formatBytes(compressedSize)}</span>
                  </div>

                  <div className="stat-item highlight-item">
                    <span className="stat-label text-savings">Space Savings</span>
                    <span className="stat-val text-savings font-large">
                      {getSavingsPercentage()}%
                    </span>
                  </div>

                  <div className="stat-item">
                    <span className="stat-label">Compression Time</span>
                    <span className="stat-val text-dim">{encodingTime} ms</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Before / After Preview */}
            <div className="panel-preview">
              <div className="card glass-card preview-card">
                <div className="preview-header">
                  <h3>Interactive Preview</h3>
                  <div className="preview-labels">
                    <span className="badge badge-original">Original (Left)</span>
                    <span className="badge badge-webp">Compressed {outputFormat.toUpperCase()} (Right)</span>
                  </div>
                </div>

                <div className="preview-workspace">
                  {isProcessing && (
                    <div className="loading-overlay">
                      <div className="spinner"></div>
                      <p>Running {outputFormat.toUpperCase()} Encoder...</p>
                    </div>
                  )}

                  {originalUrl && compressedUrl && (
                    <div 
                      className="comparison-slider-container"
                      ref={containerRef}
                      onMouseDown={(e) => handleSliderStart(e.clientX)}
                      onMouseMove={(e) => handleSliderMove(e.clientX)}
                      onTouchStart={(e) => handleSliderStart(e.touches[0].clientX)}
                      onTouchMove={(e) => handleSliderMove(e.touches[0].clientX)}
                      id="compContainer"
                    >
                      {/* Left: Original Preview Image */}
                      <img 
                        src={originalUrl} 
                        className="slider-image original" 
                        alt="Original View" 
                        draggable="false"
                        id="compBeforeImg"
                      />

                      {/* Right: Compressed Preview Image with clip-path */}
                      <img 
                        src={compressedUrl} 
                        className="slider-image compressed" 
                        alt="Compressed View" 
                        draggable="false"
                        style={{ clipPath: `polygon(${sliderPos}% 0, 100% 0, 100% 100%, ${sliderPos}% 100%)` }}
                        id="compAfterImg"
                      />

                      {/* Slider Divider Bar and Handle */}
                      <div 
                        className="slider-divider-line" 
                        style={{ left: `${sliderPos}%` }}
                        id="compSlider"
                      >
                        <div className="slider-divider-handle">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="8 17 3 12 8 7" />
                            <polyline points="16 17 21 12 16 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="preview-footer">
                  <p>Drag the slider bar to compare quality. Zooming in the browser helps inspect high-frequency detail difference.</p>
                </div>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
