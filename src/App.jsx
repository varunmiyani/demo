import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ImageCompressor from './components/ImageCompressor';
import UploadCenter from './components/UploadCenter';

export default function App() {
  const [currentTab, setCurrentTab] = useState('compressor');

  return (
    <div className="crm-layout">
      {/* Background Glows */}
      <div className="glow-bg-primary"></div>
      <div className="glow-bg-secondary"></div>

      {/* Left Sidebar navigation */}
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* Right side CRM frame */}
      <div className="crm-main">
        {/* Top Header */}
        <Header />

        {/* Active tab content view */}
        <main className="crm-content">
          {currentTab === 'compressor' ? (
            <ImageCompressor />
          ) : (
            <UploadCenter />
          )}
        </main>
      </div>
    </div>
  );
}
