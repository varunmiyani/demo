import React from 'react';

export default function Header() {
  return (
    <header className="crm-header">
      <div className="header-search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input type="text" placeholder="Search workspace..." disabled />
      </div>

      <div className="header-actions">
        <div className="status-badge-connection">
          <span className="pulse-dot"></span>
          <span className="status-text">Cloud Sync Online</span>
        </div>
        
        <div className="user-profile">
          <div className="user-avatar">PM</div>
          <div className="user-details">
            <span className="user-name">Varun Miyani</span>
            <span className="user-role">Photographer</span>
          </div>
        </div>
      </div>
    </header>
  );
}
