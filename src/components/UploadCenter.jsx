import React, { useState, useEffect, useRef } from 'react';

// Initial dummy transfer list representing the active and completed files
const initialTransfers = [
  {
    id: 1,
    name: 'Wedding_Smith_001.jpg',
    size: '32.4 MB',
    sizeBytes: 32400000,
    type: 'Photo',
    thumbnail: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=100&auto=format&fit=crop&q=60', // wedding couple photo
    status: 'Uploading',
    progress: 45
  },
  {
    id: 2,
    name: 'Wedding_BTS_Vertical.mp4',
    size: '124.8 MB',
    sizeBytes: 124800000,
    type: 'Short Video',
    thumbnail: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=100&auto=format&fit=crop&q=60', // camera recording image
    status: 'Uploading',
    progress: 82
  },
  {
    id: 3,
    name: 'Ceremony_Wide_4K.mp4',
    size: '2.1 GB',
    sizeBytes: 2100000000,
    type: 'Highlight',
    thumbnail: 'https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=100&auto=format&fit=crop&q=60', // forest landscape ceremony
    status: 'Success',
    progress: 100
  },
  {
    id: 4,
    name: 'Signed_Release_Smith.png',
    size: '1.1 MB',
    sizeBytes: 1100000,
    type: 'Photo',
    thumbnail: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=60', // portrait of woman
    status: 'Success',
    progress: 100
  },
  {
    id: 5,
    name: 'Video_Broll_01.mov',
    size: '850.5 MB',
    sizeBytes: 850500000,
    type: 'Short Video',
    thumbnail: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=100&auto=format&fit=crop&q=60', // dynamic b-roll video representation
    status: 'Failed',
    progress: 30
  },
  {
    id: 6,
    name: 'Wedding_Smith_003.jpg',
    size: '33.1 MB',
    sizeBytes: 33100000,
    type: 'Photo',
    thumbnail: null, // document placeholder icon
    status: 'Queued',
    progress: 0
  }
];

export default function UploadCenter() {
  const [transfers, setTransfers] = useState(initialTransfers);
  const [selectedRows, setSelectedRows] = useState(new Set([1, 2, 3, 4, 5, 6])); // initially select all by default like screenshot
  const [activeFilter, setActiveFilter] = useState('All'); // 'All' | 'Photos' | 'Short Videos' | 'Highlights'
  
  // File input refs for each drag-and-drop category tile
  const photoInputRef = useRef(null);
  const shortVideoInputRef = useRef(null);
  const highlightInputRef = useRef(null);

  // 1. SIMULATE ACTIVE UPLOADS IN REAL TIME (DISABLED FOR HARDCODED PREVIEW)
  // Progress states are kept static for first two uploading transfers as requested.

  // 2. CHECKBOX SELECTION LOGIC
  // Filter items based on active category filter tab
  const getFilteredTransfers = () => {
    if (activeFilter === 'All') return transfers;
    if (activeFilter === 'Photos') return transfers.filter((t) => t.type === 'Photo');
    if (activeFilter === 'Short Videos') return transfers.filter((t) => t.type === 'Short Video');
    if (activeFilter === 'Highlights') return transfers.filter((t) => t.type === 'Highlight');
    return transfers;
  };

  const filteredTransfers = getFilteredTransfers();

  // Check if a row is selected
  const isRowSelected = (id) => selectedRows.has(id);

  // Toggle individual row checkbox
  const toggleSelectRow = (id) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  // Toggle select-all checkbox for currently filtered items
  const toggleSelectAll = () => {
    const newSelected = new Set(selectedRows);
    const allFilteredSelected = filteredTransfers.every((t) => newSelected.has(t.id));

    if (allFilteredSelected) {
      // Remove all currently filtered items from selection
      filteredTransfers.forEach((t) => newSelected.delete(t.id));
    } else {
      // Add all currently filtered items to selection
      filteredTransfers.forEach((t) => newSelected.add(t.id));
    }
    setSelectedRows(newSelected);
  };

  // 3. ROW CRUD & ACTION TRIGGERS
  // Delete individual transfer
  const deleteTransfer = (id) => {
    setTransfers((prev) => prev.filter((t) => t.id !== id));
    const newSelected = new Set(selectedRows);
    newSelected.delete(id);
    setSelectedRows(newSelected);
  };

  // Bulk delete selected items
  const deleteSelected = () => {
    setTransfers((prev) => prev.filter((t) => !selectedRows.has(t.id)));
    setSelectedRows(new Set());
  };

  // Cancel all active uploads
  const cancelAllUploads = () => {
    setTransfers((prev) =>
      prev.map((item) =>
        item.status === 'Uploading' ? { ...item, status: 'Failed' } : item
      )
    );
  };

  // Retry failed upload
  const retryTransfer = (id) => {
    setTransfers((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'Uploading', progress: 0 } : item
      )
    );
  };

  // 4. ADD NEW FILE HANDLERS
  // Initiates mock upload on file selection
  const handleAddNewFile = (e, fileType) => {
    const fileObj = e.target.files?.[0];
    if (!fileObj) return;

    // Format human-readable file size
    const sizeStr =
      fileObj.size > 1024 * 1024 * 1024
        ? (fileObj.size / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
        : (fileObj.size / (1024 * 1024)).toFixed(1) + ' MB';

    const newId = Date.now();
    const newTransferItem = {
      id: newId,
      name: fileObj.name,
      size: sizeStr,
      sizeBytes: fileObj.size,
      type: fileType,
      thumbnail: null, // document placeholder icon
      status: 'Uploading',
      progress: 0
    };

    setTransfers((prev) => [newTransferItem, ...prev]);
    
    // Automatically select the newly added row
    const newSelected = new Set(selectedRows);
    newSelected.add(newId);
    setSelectedRows(newSelected);

    // Reset input value to trigger again
    e.target.value = '';
  };

  // 5. CALCULATE TOTALS AND PROGRESS METRICS
  const totalUploadingCount = transfers.filter((t) => t.status === 'Uploading').length;
  const totalFailedCount = transfers.filter((t) => t.status === 'Failed').length;
  const totalQueuedCount = transfers.filter((t) => t.status === 'Queued').length;
  
  // Total transfer sizes computation
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const totalBytes = transfers.reduce((acc, curr) => acc + curr.sizeBytes, 0);
  const transferredBytes = transfers.reduce((acc, curr) => {
    // If successful, 100% of size is transferred. Otherwise, match the progress slider.
    if (curr.status === 'Success') return acc + curr.sizeBytes;
    return acc + Math.round((curr.sizeBytes * curr.progress) / 100);
  }, 0);

  const isAllFilteredSelected = filteredTransfers.length > 0 && filteredTransfers.every((t) => selectedRows.has(t.id));

  return (
    <div className="upload-center-wrapper animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* SECTION 1: TOP CATEGORY DRAG & DROP TILES */}
      <div className="upload-tiles-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        
        {/* Photos Tile */}
        <div 
          className="upload-tile-card card glass-card"
          onClick={() => photoInputRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', padding: '1.5rem', cursor: 'pointer', transition: 'var(--transition-smooth)' }}
        >
          <input 
            type="file" 
            ref={photoInputRef} 
            onChange={(e) => handleAddNewFile(e, 'Photo')} 
            accept="image/*" 
            style={{ display: 'none' }} 
          />
          <div className="tile-icon-box" style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '1rem' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </div>
          <div className="tile-text">
            <h4 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Photos</h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>JPEG, JPG • Ready for liftoff</span>
          </div>
        </div>

        {/* Short Videos Tile */}
        <div 
          className="upload-tile-card card glass-card"
          onClick={() => shortVideoInputRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', padding: '1.5rem', cursor: 'pointer', transition: 'var(--transition-smooth)' }}
        >
          <input 
            type="file" 
            ref={shortVideoInputRef} 
            onChange={(e) => handleAddNewFile(e, 'Short Video')} 
            accept="video/*" 
            style={{ display: 'none' }} 
          />
          <div className="tile-icon-box" style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(217, 70, 239, 0.1)', color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '1rem' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </div>
          <div className="tile-text">
            <h4 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Short Videos</h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1-2 min max • Ready for liftoff</span>
          </div>
        </div>

        {/* Highlights Tile */}
        <div 
          className="upload-tile-card card glass-card"
          onClick={() => highlightInputRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', padding: '1.5rem', cursor: 'pointer', transition: 'var(--transition-smooth)' }}
        >
          <input 
            type="file" 
            ref={highlightInputRef} 
            onChange={(e) => handleAddNewFile(e, 'Highlight')} 
            accept="video/*" 
            style={{ display: 'none' }} 
          />
          <div className="tile-icon-box" style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '1rem' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </div>
          <div className="tile-text">
            <h4 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Highlights</h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>8-10 min max • Ready for liftoff</span>
          </div>
        </div>

      </div>

      {/* SECTION 2: WORKSPACE FILTER HEADER */}
      <div className="upload-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem', width: '100%' }}>
        {/* Left aligned: Title */}
        <div className="upload-title-block" style={{ flex: '0 0 auto', minWidth: '180px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Upload Center</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Managing {transfers.length} active transfers.</span>
        </div>

        {/* Centered: Category filter tabs (inline flex wrapper, no-wrap grid override) */}
        <div className="upload-filters-centered" style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center', minWidth: 'fit-content', whiteSpace: 'nowrap' }}>
          <div className="presets-toggle" style={{ margin: 0, display: 'flex', flexWrap: 'nowrap', width: 'fit-content' }}>
            {['All', 'Photos', 'Short Videos', 'Highlights'].map((filterItem) => (
              <button
                key={filterItem}
                className={`preset-btn ${activeFilter === filterItem ? 'active' : ''}`}
                onClick={() => setActiveFilter(filterItem)}
                style={{ padding: '0.5rem 1.25rem', whiteSpace: 'nowrap' }}
              >
                <span className="preset-name" style={{ fontSize: '0.8rem' }}>{filterItem}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right aligned: Cancel Upload button */}
        <div className="upload-actions-right" style={{ flex: '0 0 auto', minWidth: '180px', display: 'flex', justifyContent: 'flex-end' }}>
          {totalUploadingCount > 0 ? (
            <button 
              className="btn-clear-image" 
              onClick={cancelAllUploads}
              style={{ padding: '0.5rem 1rem', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', whiteSpace: 'nowrap' }}
            >
              Cancel Upload
            </button>
          ) : (
            <div style={{ width: '120px', height: '1px' }}></div>
          )}
        </div>
      </div>

      {/* SECTION 3: TRANSFERS TABLE */}
      <div className="card glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredTransfers.length > 0 ? (
          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table className="upload-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-glass)', background: 'rgba(255, 255, 255, 0.01)' }}>
                  
                  {/* Select All Checkbox */}
                  <th style={{ padding: '1rem', width: '48px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <input 
                        type="checkbox" 
                        checked={isAllFilteredSelected} 
                        onChange={toggleSelectAll} 
                        style={{ cursor: 'pointer' }}
                      />
                      {selectedRows.size > 0 && (
                        <button 
                          onClick={deleteSelected}
                          title="Delete selected items"
                          style={{ background: 'transparent', border: 'none', color: '#fca5a5', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                      )}
                    </div>
                  </th>

                  <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '600', width: '80px' }}>Thumb</th>
                  <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '600' }}>File Name</th>
                  <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '600', width: '120px' }}>Size</th>
                  <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '600', width: '150px' }}>Type</th>
                  <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '600', width: '150px', textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.map((item) => {
                  const isSelected = isRowSelected(item.id);
                  
                   // Compute dynamic green progress bar overlays spanning the table rows during active uploads
                   const backgroundProgress = item.status === 'Uploading'
                     ? `linear-gradient(90deg, rgba(16, 185, 129, 0.12) ${item.progress}%, transparent ${item.progress}%)`
                     : 'transparent';

                  return (
                    <tr 
                      key={item.id} 
                      style={{ 
                        borderBottom: '1px solid var(--border-glass)', 
                        background: backgroundProgress,
                        transition: 'background 0.3s ease'
                      }}
                      className="upload-table-row"
                    >
                      {/* Checkbox select */}
                      <td style={{ padding: '1rem' }}>
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={() => toggleSelectRow(item.id)} 
                          style={{ cursor: 'pointer' }}
                        />
                      </td>

                      {/* Thumbnail frame */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ width: '48px', height: '36px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.01)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                          )}
                        </div>
                      </td>

                      {/* Filename */}
                      <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                        {item.name}
                      </td>

                      {/* File size */}
                      <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {item.size}
                      </td>

                      {/* Category Type */}
                      <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {item.type}
                      </td>

                      {/* Status Badges & action links */}
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'flex-end' }}>
                          
                          {/* 1. Uploading State with live percentages */}
                          {item.status === 'Uploading' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className="badge badge-sandbox" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#c7d2fe', fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>Uploading</span>
                              <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#c7d2fe', minWidth: '35px' }}>{item.progress}%</span>
                            </div>
                          )}

                          {/* 2. Success Badge */}
                          {item.status === 'Success' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#a7f3d0', border: '1px solid rgba(16, 185, 129, 0.2)', fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>Success</span>
                              <button 
                                onClick={() => deleteTransfer(item.id)}
                                title="Delete transfer history"
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                              >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                              </button>
                            </div>
                          )}

                          {/* 3. Failed Badge with retry trigger */}
                          {item.status === 'Failed' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>Failed</span>
                              <button 
                                onClick={() => retryTransfer(item.id)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', padding: 0 }}
                              >
                                Retry
                              </button>
                            </div>
                          )}

                          {/* 4. Queued Badge */}
                          {item.status === 'Queued' && (
                            <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)', border: '1px solid var(--border-glass)', fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>Queued</span>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>No active transfers matching filter.</p>
          </div>
        )}

        {/* SECTION 4: TRANSFER TABLE FOOTER SUMMARY */}
        <div 
          className="table-summary-footer" 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '1rem 1.5rem', 
            background: 'rgba(255, 255, 255, 0.01)', 
            borderTop: '1px solid var(--border-glass)', 
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            fontWeight: '500'
          }}
        >
          <div>
            <span>{totalUploadingCount} Uploading</span>
            <span style={{ margin: '0 0.5rem' }}>•</span>
            <span>{totalFailedCount} Failed</span>
            <span style={{ margin: '0 0.5rem' }}>•</span>
            <span>{totalQueuedCount} Queued</span>
          </div>
          <div>
            <span>Total Transferred: {formatBytes(transferredBytes)} / {formatBytes(totalBytes)}</span>
          </div>
        </div>

      </div>

    </div>
  );
}
