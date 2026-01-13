import React, { useState } from 'react';
import './ExcelGenerator.css'; 

const BACKEND_URL = 'http://localhost:8000/generate-excel/';

export default function ExcelGenerator() {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [statusType, setStatusType] = useState(''); 
  const [isLoading, setIsLoading] = useState(false);
  
  // State to manage which content is displayed: 'home', 'instructions', or 'dashboard'
  const [view, setView] = useState('home');

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setMessage(''); 
      setStatusType('');
    } else {
      setFile(null);
      setMessage('⚠️ Please select a valid PDF file.');
      setStatusType('error');
    }
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsLoading(true);
    setMessage(`Processing ${file.name}...`);
    setStatusType('loading');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('scheme', '2019');
    formData.append('semester', 'S1');

    try {
      const response = await fetch(BACKEND_URL, { method: 'POST', body: formData });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${file.name.replace('.pdf', '')}_Converted.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setMessage(`✅ Success! Excel downloaded.`);
        setStatusType('success');
      } else {
        setMessage(`❌ Failed: Server Error`);
        setStatusType('error');
      }
    } catch (error) {
      setMessage(`❌ Network Error: Check connection.`);
      setStatusType('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="nav-links">
          <span className="nav-link-item" onClick={() => setView('dashboard')}>Dashboard</span>
          <span className="nav-link-item" onClick={() => setView('home')}>History</span>
          <span className="nav-link-item">Settings</span>
          {/* Label changed to "How to Use" */}
          <button className="nav-btn" onClick={() => setView('instructions')}>How to Use</button>
        </div>
      </nav>

      <main className="main-content">
        <div className="hero-section">
          <div className="left-panel">
            
            {/* --- VIEW: HOME/CONVERTER --- */}
            {view === 'home' && (
              <div className="fade-in">
                <h1>PDF2Sheets</h1>
                <p className="subtitle">Instant KTU Result Extraction to Excel Workbook</p>
                <div className="drop-zone">
                  <p>Drag & Drop KTU Result PDF Here</p>
                  <input type="file" id="fileInput" hidden accept=".pdf" onChange={handleFileChange} />
                  <label htmlFor="fileInput" className="browse-btn">
                    {file ? 'Change PDF' : 'Browse Files'}
                  </label>
                  {file && <p className="file-name">📄 {file.name}</p>}
                </div>
                <div className="action-section">
                   <div className="convert-icon-box">
                      <div className="excel-preview-icon">X</div>
                      <span className="arrow-right">→</span>
                   </div>
                   <button className="convert-btn-text" onClick={handleConvert} disabled={!file || isLoading}>
                    {isLoading ? 'Converting...' : 'Convert to Excel Workbook'}
                  </button>
                </div>
                {message && <div className={`status-box ${statusType}`}>{message}</div>}
              </div>
            )}

            {/* --- VIEW: HOW TO USE --- */}
            {view === 'instructions' && (
              <div className="fade-in">
                <h1>How to Use</h1>
                <div className="instruction-content">
                  <p>1. Upload your <b>KTU Result PDF</b> using the Browse button.</p>
                  <p>2. Verify the filename appears in green.</p>
                  <p>3. Click <b>"Convert to Excel Workbook"</b>.</p>
                  <p>4. Your formatted .xlsx file will download automatically.</p>
                </div>
                <button className="browse-btn" style={{marginTop: '20px'}} onClick={() => setView('home')}>Back to Home</button>
              </div>
            )}

            {/* --- VIEW: DASHBOARD --- */}
            {view === 'dashboard' && (
              <div className="fade-in dashboard-view">
                <h1>Miniproject</h1>
                <div className="profile-box">
                  <img src="https://lh3.googleusercontent.com/gps-cs-s/AG0ilSxA30Q-k7NgGfew8oo69Toz1dRTHTTH-v7eVrtYVkF3l9m9l_9kKTbEN3BeQguztjo5EMakX3x2Bv5Tz6UY6CS8CYMM-1rIm4Kpz73WFdlW9xrnOUqk4J6vXMxcT6AjM_I_nNjUGA=s1360-w1360-h1020" alt="Profile" className="profile-img" />
                  <p className="subtitle">Project: KTU PDF Result Extractor</p>
                </div>
                <button className="browse-btn" onClick={() => setView('home')}>Back to Home</button>
              </div>
            )}

            <div className="footer-icons">
               <span>🔒 Secure</span>
               <span>⚡ Fast</span>
               <span>🎯 Accurate</span>
            </div>
          </div>

          <div className="right-panel">
            <img 
              src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80" 
              alt="Data Analysis Dashboard" 
            />
          </div>
        </div>
      </main>
    </div>
  );
}