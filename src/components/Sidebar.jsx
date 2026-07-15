import React from 'react';

export default function Sidebar({ currentTab, setCurrentTab }) {
  return (
    <aside className="crm-sidebar">
      <div className="sidebar-brand">
        <div className="brand-dot"></div>
        <h2>Studio-OS</h2>
      </div>
      
      <nav className="sidebar-nav">
        <button 
          className={`sidebar-nav-item ${currentTab === 'compressor' ? 'active' : ''}`}
          onClick={() => setCurrentTab('compressor')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>Test Compressor</span>
        </button>

        <button 
          className={`sidebar-nav-item ${currentTab === 'upload' ? 'active' : ''}`}
          onClick={() => setCurrentTab('upload')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Upload</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className="footer-status">
          <span className="status-dot online"></span>
          <span>Workspace Active</span>
        </div>
      </div>
    </aside>
  );
}
