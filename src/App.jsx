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
  
  // Simple Payment State
  const [selectedAmount, setSelectedAmount] = useState(500);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const quickPayFormRef = useRef(null);

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

  // Load Razorpay Hosted Payment Button script dynamically
  useEffect(() => {
    if (!quickPayFormRef.current) return;
    
    // Clear out to prevent duplication during hot reloads
    quickPayFormRef.current.innerHTML = '';
    
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/payment-button.js';
    script.setAttribute('data-payment_button_id', 'pl_TDi5nRLHukOWRg');
    script.async = true;
    
    quickPayFormRef.current.appendChild(script);
  }, []);

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
    // Clear input value so that the change event will trigger even if the same file is selected again
    e.target.value = '';
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
          maxDim = 300;
        } else if (sizePreset === 'medium') {
          maxDim = 1920;
        } else if (sizePreset === 'original') {
          if (resPreset === '4k') {
            maxDim = 3840;
          } else if (resPreset === '2k') {
            maxDim = 2048;
          }
        }
        
        // Apply downscaling proportionally to respect original aspect ratio (Portrait or Landscape)
        if (maxDim && (originalWidth > maxDim || originalHeight > maxDim)) {
          if (originalWidth > originalHeight) {
            targetWidth = maxDim;
            targetHeight = Math.round((originalHeight * maxDim) / originalWidth);
          } else {
            targetHeight = maxDim;
            targetWidth = Math.round((originalWidth * maxDim) / originalHeight);
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
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

  // Drag & drop events
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
    // Reset file input value to allow uploading the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePayment = async () => {
    setIsProcessingPayment(true);
    try {
      // 1. Create order on the backend
      const response = await fetch('http://localhost:5001/api/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount: selectedAmount })
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to create payment order');
      }
      
      const orderData = await response.json();
      
      // 2. Open Razorpay Checkout Modal
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID, // Loaded from env in Vite
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Studio-OS',
        description: 'Test Premium Subscription Payment',
        order_id: orderData.order_id,
        handler: async (paymentResponse) => {
          setIsProcessingPayment(true);
          try {
            // 3. Verify Payment Signature
            const verifyResponse = await fetch('http://localhost:5001/api/verify-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature
              })
            });
            
            const verifyData = await verifyResponse.json();
            if (verifyResponse.ok && verifyData.success) {
              alert(`🎉 Payment Successful!\nTransaction ID: ${paymentResponse.razorpay_payment_id}\nYour premium subscription is now active.`);
            } else {
              alert(`❌ Payment verification failed: ${verifyData.error || 'Signature mismatch'}`);
            }
          } catch (verifyErr) {
            console.error(verifyErr);
            alert(`❌ Payment verification error: ${verifyErr.message}`);
          } finally {
            setIsProcessingPayment(false);
          }
        },
        prefill: {
          name: 'Sandbox Customer',
          email: 'customer@studio-os.com',
          contact: '9999999999'
        },
        theme: {
          color: '#6366f1' // brand primary color (indigo)
        },
        modal: {
          ondismiss: () => {
            alert('⚠️ Payment checkout closed by user.');
            setIsProcessingPayment(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      
      rzp.on('payment.failed', (response) => {
        console.error('Payment failed details:', response.error);
        alert(`❌ Payment failed: ${response.error.description || 'Transaction declined'}`);
        setIsProcessingPayment(false);
      });
      
      rzp.open();
      
    } catch (err) {
      console.error('Payment initialization error:', err);
      alert(`❌ Failed to start checkout: ${err.message}`);
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="app-layout">
      {/* Background Gradients */}
      <div className="glow-bg-primary"></div>
      <div className="glow-bg-secondary"></div>

      <header className="app-header">
        <div className="brand">
          <div className="brand-dot"></div>
          <h1>Studio-OS <span>Compressor OS</span></h1>
        </div>
        <p className="brand-subtitle">High-performance client-side image compression workspace</p>
      </header>

      <main className="app-container">
        
        {/* Simple Payment Gateway Sandbox Control Bar */}
        <div className="card glass-card payment-test-card animate-fade-in">
          <div className="payment-test-header">
            <div className="payment-title">
              <div className="payment-title-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              </div>
              <h3>Payment Gateway Sandbox</h3>
            </div>
            <span className="badge badge-sandbox">Test Gateway</span>
          </div>
          <div className="payment-test-body">
            <div className="amount-selector-row">
              <span className="select-label">Select Amount:</span>
              <div className="amount-options">
                {[500, 1000, 5999].map((amt) => (
                  <button
                    key={amt}
                    className={`amount-btn ${selectedAmount === amt ? 'active' : ''}`}
                    onClick={() => setSelectedAmount(amt)}
                  >
                    ₹{amt.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
              <button 
                className="btn-primary pay-now-btn" 
                onClick={handlePayment}
                disabled={isProcessingPayment}
              >
                {isProcessingPayment ? (
                  <>
                    <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', marginRight: '6px', borderTopColor: '#fff' }}></span>
                    Loading...
                  </>
                ) : (
                  'Pay Now'
                )}
              </button>
            </div>

            {/* Flat ₹5999 Quick Pay Pre-built Button */}
            <div className="quick-pay-row" style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px dashed var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div className="quick-pay-info">
                <span className="select-label" style={{ display: 'block', marginBottom: '0.25rem' }}>Quick Pay Checkout:</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pay flat ₹5,999 directly via Razorpay Hosted Payment button</span>
              </div>
              <form ref={quickPayFormRef} style={{ minHeight: '40px', display: 'flex', alignItems: 'center' }}>
                {/* Script injected dynamically */}
              </form>
            </div>
          </div>
        </div>

        <div className="workspace-grid">
          
          {/* Left Panel: Compression Controls */}
          <div className="panel-controls">
            <div className="card glass-card">
              <div className="card-header">
                <h3>Settings</h3>
              </div>
              
              {/* File details */}
              {file ? (
                <div className="file-info-badge">
                  <div className="file-info-text">
                    <span className="file-name" title={file.name}>{file.name}</span>
                    <span className="file-meta">{formatBytes(file.size)}</span>
                  </div>
                </div>
              ) : (
                <div className="file-info-badge no-file">
                  <span className="file-meta">No image loaded</span>
                </div>
              )}

              {/* Output format selector */}
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

              {/* Compression Quality */}
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

              {/* Output Size Preset */}
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
                  Download {outputFormat.toUpperCase()}
                </button>
              </div>
            </div>

            {/* Statistics Card */}
            <div className="card glass-card stats-card">
              <h3>Compression Metrics</h3>
              
              {file ? (
                <div className="stats-list animate-fade-in">
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
              ) : (
                <div className="stats-empty-state">
                  <p>Awaiting image upload to generate stats.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Compact Upload + Interactive Preview */}
          <div className="panel-preview">
            
            {/* Small Dropzone (Always Visible above preview) */}
            <div 
              className={`small-dropzone ${isDragOver ? 'dragover' : ''}`}
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
              <div className="small-dropzone-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="small-dropzone-text">
                <p>Drag & drop photo here or <span>browse files</span> to compress / override</p>
              </div>
            </div>

            {/* Interactive Preview Card */}
            <div className="card glass-card preview-card">
              <div className="preview-header">
                <div className="preview-title-row">
                  <h3>Interactive Preview</h3>
                  {file && (
                    <button className="btn-clear-image" onClick={resetUploader}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                      Clear
                    </button>
                  )}
                </div>
                {file && (
                  <div className="preview-labels">
                    <span className="badge badge-original">Original</span>
                    <span className="badge badge-webp">{outputFormat.toUpperCase()}</span>
                  </div>
                )}
              </div>

              <div className="preview-workspace">
                {isProcessing && (
                  <div className="loading-overlay">
                    <div className="spinner"></div>
                    <p>Encoding to {outputFormat.toUpperCase()}...</p>
                  </div>
                )}

                {file && originalUrl && compressedUrl ? (
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
                ) : (
                  <div className="preview-empty-state">
                    <div className="empty-state-icon">
                      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                    <h4>No image loaded</h4>
                    <p>Drag an image into the box above to see the side-by-side compression comparison.</p>
                  </div>
                )}
              </div>
              
              <div className="preview-footer">
                <p>Drag the slider bar to compare quality. Zooming in the browser helps inspect high-frequency detail difference.</p>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
