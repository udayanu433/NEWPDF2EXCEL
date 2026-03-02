import React, { useState, useEffect } from 'react'; import { BarChart, Bar, XAxis, YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import './ExcelGenerator.css';

const BASE_URL = 'http://localhost:8000/generate-excel/';

export default function ExcelGenerator() {
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState('home');
  const [analysisData, setAnalysisData] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState('');
  const [downloadingType, setDownloadingType] = useState(null);
  const [downloaded, setDownloaded] = useState({});
  const [pendingRedownload, setPendingRedownload] = useState(null);

  const [globalStats, setGlobalStats] = useState({
    total_students: 0,
    overall_pass: 0,
    departments: 0
  });

  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const handleDragOver = (e) => {
      e.preventDefault();
      setDragActive(true);
    };

    const handleDragLeave = (e) => {
      // if leaving the window entirely
      if (e.clientX === 0 && e.clientY === 0) {
        setDragActive(false);
      }
    };

    const handleDrop = (e) => {
      e.preventDefault();
      setDragActive(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) processFileSelection(dropped);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  const handleFileChange = (e) => {
    const selected = e.target?.files?.[0];
    if (!selected) return;
    processFileSelection(selected);
  };

  // shared file validation logic
  const processFileSelection = (selected) => {
    if (!selected) return;

    if (selected.type !== 'application/pdf') {
      setFile(null);
      setError('Please select a valid KTU Result PDF.');
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setFile(null);
      setError('PDF too large. Maximum size is 10MB.');
      return;
    }

    setFile(selected);
    setError('');
  };

  const resetAll = () => {
    setView('home');
    setFile(null);
    setAnalysisData([]);
    setDownloadUrl(null);
    setGlobalStats({
      total_students: 0,
      overall_pass: 0,
      departments: 0
    });
    setError('');
    setDownloaded({});
  };

  // 🔥 MAIN ANALYSIS (Full Workbook)
  const handleConvert = async () => {
    if (!file) return;

    setIsLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${BASE_URL}?type=full`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error();

      const statsHeader = response.headers.get('X-Analysis-Stats');
      const globalHeader = response.headers.get('X-Global-Stats');

      if (statsHeader) {
        const parsedStats = JSON.parse(statsHeader);
        setAnalysisData(parsedStats);
        console.log('X-Analysis-Stats:', parsedStats);
      }
      if (globalHeader) {
        const parsedGlobal = JSON.parse(globalHeader);
        setGlobalStats(parsedGlobal);
        console.log('X-Global-Stats:', parsedGlobal);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);

      setView('results');
    } catch {
      setError('Connection failed or invalid PDF format.');
    } finally {
      setIsLoading(false);
    }
  };

  // 🔥 DOWNLOAD SPECIFIC TYPE
  const performDownload = async (type) => {
    if (!file) return;

    setDownloadingType(type);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${BASE_URL}?type=${type}`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error();

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;

      const names = {
        full: 'KTU_Full_Analysis.xlsx',
        summary: 'KTU_College_Summary.xlsx',
        branches: 'KTU_Branch_Sheets.xlsx',
        fail: 'KTU_Subject_Fail_Analysis.xlsx',
        supply: 'KTU_Supply_Only.xlsx'
      };

      link.download = names[type] || '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // mark this type as downloaded for UI
      try {
        setDownloaded((p) => ({ ...(p || {}), [type]: true }));
      } catch (e) {
        /* ignore */
      }

      window.URL.revokeObjectURL(url);
    } catch {
      setError('Download failed.');
    } finally {
      setDownloadingType(null);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const p = payload[0];
      const d = p.payload || {};
      const total = (d.total !== undefined && d.total !== null) ? d.total : '-';
      const passed = (d.passed !== undefined && d.passed !== null) ? d.passed : '-';
      const passPerc = (d.pass !== undefined && d.pass !== null) ? d.pass : (p.value !== undefined ? p.value : '-');
      return (
        <div className="custom-tooltip" style={{minWidth: 180}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6}}>
            <span className="tooltip-marker" style={{background: p.fill || '#6366f1'}} />
            <strong style={{fontSize: '1rem'}}>{d.dept || label}</strong>
          </div>
          <div style={{fontSize: '0.95rem'}}>Students Appeared: <strong>{total}</strong></div>
          <div style={{fontSize: '0.95rem'}}>Students Passed: <strong>{passed}</strong></div>
          <div style={{fontSize: '0.95rem'}}>Pass %: <strong>{passPerc}%</strong></div>
        </div>
      );
    }
    return null;  a
  };

  const downloadSpecificReport = (type) => {
    if (!file) return;

    if (downloaded && downloaded[type]) {
      // show app-level confirm modal instead of relying on window.confirm
      setPendingRedownload(type);
      return;
    }

    performDownload(type);
  };

  return (
    <div className="app-shell">
      <nav className="navbar">
        <div className="logo" onClick={() => setView('home')}>
          PDF<span>2</span>Sheets
        </div>
        <div className="nav-links">
          <button
            className={view === 'home' ? 'active' : ''}
            onClick={() => setView('home')}
          >
            Converter
          </button>
          {analysisData.length > 0 && (
            <button
              className={view === 'results' ? 'active' : ''}
              onClick={() => setView('results')}
            >
              Dashboard
            </button>
          )}
        </div>
      </nav>

      <main className="content">
        {view === 'home' ? (
          <div className="hero-section fade-in">
            <div className="text-panel">
              <span className="badge">New: 2024 Scheme Supported</span>
              <h1>
                Turn KTU PDFs into <span>Smart Insights.</span>
              </h1>
              <p>
                Extract student grades, calculate SGPA, and generate
                department-wise analytics instantly.
              </p>

              <div className={`drop-zone ${file || dragActive ? 'active' : ''}`}>
                <input
                  type="file"
                  id="pdf-up"
                  hidden
                  accept=".pdf"
                  onChange={handleFileChange}
                />
                <label htmlFor="pdf-up">
                  <div className="upload-icon">{file ? '📄' : '📂'}</div>
                  {file ? (
                    <div className="file-ready">
                      <strong>{file.name}</strong>
                      <span>Ready to extract analytics</span>
                    </div>
                  ) : (
                    dragActive ? 'Drop PDF anywhere' : 'Browse files or drag KTU PDF here'
                  )}
                </label>
              </div>

              {file && (
                <button
                  className="main-btn"
                  onClick={handleConvert}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="loader"></span>
                  ) : (
                    'Analyze & Generate Excel'
                  )}
                </button>
              )}

              {error && <p className="error-text">{error}</p>}
            </div>

            <div className="image-panel">
              <div className="floating-card">
                🎯 99% Extraction Accuracy
              </div>
              <img
                src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80"
                alt="Analysis Preview"
              />
            </div>
          </div>
        ) : (
          <div className="dashboard fade-in">
            <header className="dash-header">
              <div>
                <h2>Intelligence Overview</h2>
                <p>
                  Based on results extracted from{' '}
                  <strong>{file?.name}</strong>
                </p>
              </div>
              <div className="header-btns">
                <button className="secondary-btn" onClick={resetAll}>
                  New Upload
                </button>
                <button
                  className="main-btn"
                  onClick={() => downloadSpecificReport('full')}
                >
                  Download Full Workbook
                </button>
              </div>
            </header>

            <div className="stat-row">
              <div className="stat-card">
                <span>Total Students</span>
                <strong>{globalStats.total_students}</strong>
              </div>
              <div className="stat-card">
                <span>Overall Pass %</span>
                <strong className="success">
                  {globalStats.overall_pass}%
                </strong>
              </div>
              <div className="stat-card">
                <span>Total Departments</span>
                <strong>{globalStats.departments}</strong>
              </div>
            </div>

            <div className="grid-main">
              <div className="card chart-card">
                <h3>Department-wise Success Rate</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analysisData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="dept" />
                    <YAxis domain={[0, 100]} unit="%" />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="pass" radius={[6, 6, 0, 0]} barSize={45}>
                      {analysisData.map((e, i) => (
                        <Cell
                          key={i}
                          fill={e.pass > 85 ? '#10b981' : '#6366f1'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card assets-card">
                <h3>Extracted Data Assets</h3>
                <ul className="asset-list">
                  <li
                    className="active-item"
                    onClick={() => downloadSpecificReport('summary')}
                  >
                    <span className="icon">📊</span>
                    <div>
                      <strong>College-Wide Summary</strong>
                      <span>Consolidated statistics</span>
                    </div>
                    <span className="status-badge">
                      {downloaded['summary'] ? 'Downloaded' : (downloadingType === 'summary' ? 'Downloading...' : 'Download')}
                    </span>
                  </li>

                  <li
                    className="active-item"
                    onClick={() => downloadSpecificReport('branches')}
                  >
                    <span className="icon">👥</span>
                    <div>
                      <strong>Individual Branch Sheets</strong>
                      <span>Student lists with SGPA</span>
                    </div>
                    <span className="status-badge">
                      {downloaded['branches'] ? 'Downloaded' : (downloadingType === 'branches' ? 'Downloading...' : 'Download')}
                    </span>
                  </li>

                  <li
                    className="active-item"
                    onClick={() => downloadSpecificReport('fail')}
                  >
                    <span className="icon">⚠️</span>
                    <div>
                      <strong>Subject-wise Fail Analysis</strong>
                      <span>Tough subjects per department</span>
                    </div>
                    <span className="status-badge">
                      {downloaded['fail'] ? 'Downloaded' : (downloadingType === 'fail' ? 'Downloading...' : 'Download')}
                    </span>
                  </li>
                </ul>

                <div className="secure-tag">
                  🔒 All data processed locally & securely
                </div>
              </div>
            </div>
              {pendingRedownload && (
                <div className="confirm-overlay">
                  <div className="confirm-box">
                    <p>This report was already downloaded. Download again?</p>
                    <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'center'}}>
                      <button className="secondary-btn" onClick={() => setPendingRedownload(null)}>Cancel</button>
                      <button className="main-btn" onClick={() => { performDownload(pendingRedownload); setPendingRedownload(null); }}>Download Again</button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        )}
      </main>
    </div>
  );
}
