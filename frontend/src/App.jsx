import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon asset paths breaking inside Vite bundling configurations
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Dynamic Base URL resolving to whatever IP address loaded the web app (laptop or mobile)
const API_BASE_URL = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:8000`
  : 'http://localhost:8000';

// --- INDEXEDDB CONFIGURATION & INITIALIZATION ---
const DB_NAME = 'POARegistryOfflineDB';
const STORE_NAME = 'telemetry_cache';
const DB_VERSION = 1;

const initIndexedDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

function App() {
  const [counties, setCounties] = useState([]);
  const [selectedCounty, setSelectedCounty] = useState('');
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [geoData, setGeoData] = useState(null);

  // Form States & Consent
  const [projectId, setProjectId] = useState('');
  const [logType, setLogType] = useState('public_project');
  const [selectedFile, setSelectedFile] = useState(null);
  const [consentGranted, setConsentGranted] = useState(false);

  // Geolocation & Status Flags
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibratedCoords, setCalibratedCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Offline Sync Management State
  const [offlineCount, setOfflineCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const cameraInputRef = useRef(null);
  const defaultCenter = [-0.5200, 36.9500];
  const defaultZoom = 10;

  // Cache Sync Job Execution Routine
  const executeCacheSyncJob = useCallback(async () => {
    setIsSyncing(true);
    try {
      const db = await initIndexedDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      store.getAll().onsuccess = async (e) => {
        const records = e.target.result.filter(r => r.status === 'pending');
        if (records.length === 0) {
          setIsSyncing(false);
          return;
        }

        console.log(`🌐 Network online detected! Auto-syncing ${records.length} pending audit(s)...`);

        for (const record of records) {
          const syncData = new FormData();
          syncData.append('project_id', record.projectId);
          syncData.append('log_type', record.logType);
          syncData.append('latitude', record.latitude);
          syncData.append('longitude', record.longitude);

          // Re-inflate Blob to File format before transmission
          const filePayload = new File([record.fileBlob], record.fileName, { type: record.fileType });
          syncData.append('files', filePayload);

          try {
            await axios.post(`${API_BASE_URL}/api/verify`, syncData, {
              headers: {
                'Content-Type': 'multipart/form-data',
                'X-Idempotency-Key': record.id
              }
            });
            // Delete from IndexedDB upon confirmed server handshake
            const writeDb = await initIndexedDB();
            await writeDb.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(record.id);
            setOfflineCount(prev => Math.max(0, prev - 1));
          } catch (syncErr) {
            console.error(`Sync transmission attempt paused for transaction link: ${record.id}`, syncErr);
            break; // Pause loop if remote server remains unreachable
          }
        }
        setIsSyncing(false);
      };
    } catch (err) {
      console.error("Cache processing execution routine halted", err);
      setIsSyncing(false);
    }
  }, []);

  // 1. System Bootstrap: Fetch directories, open IndexedDB, 12-Hour TTL Sweep, & Register Auto-Sync
  useEffect(() => {
    // Dynamic API directory initializations
    axios.get(`${API_BASE_URL}/api/counties`)
      .then(res => {
        if (res.data.counties) {
          setCounties(res.data.counties);
          if (res.data.counties.length > 0) setSelectedCounty(res.data.counties[0]);
        }
      }).catch(err => console.error("Database connection fault", err));

    axios.get(`${API_BASE_URL}/api/maps/locations`)
      .then(res => setGeoData(res.data))
      .catch(err => console.error("Map layer connection failure", err));

    // Open local storage and execute self-deletion cleanup logic
    initIndexedDB().then(async (db) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      store.getAll().onsuccess = (e) => {
        const records = e.target.result;
        const now = Date.now();
        const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
        let pendingCount = 0;

        records.forEach(record => {
          if (now - record.timestamp > TWELVE_HOURS_MS) {
            db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(record.id);
            console.log(`TTL Clean Engine: Purged expired file cache payload: ${record.id}`);
          } else if (record.status === 'pending') {
            pendingCount++;
          }
        });
        setOfflineCount(pendingCount);
      };
    }).catch(err => console.error("IndexedDB engine initialization failure", err));

    // Register Network Restoration Event Listener for Automatic Sync
    const handleOnlineStatus = () => executeCacheSyncJob();
    window.addEventListener('online', handleOnlineStatus);
    return () => window.removeEventListener('online', handleOnlineStatus);
  }, [executeCacheSyncJob]);

  // 2. Project directory synchronization handler
  useEffect(() => {
    if (!selectedCounty) return;
    axios.get(`${API_BASE_URL}/api/projects/${encodeURIComponent(selectedCounty)}`)
      .then(res => {
        setProjects(res.data.projects || []);
        setSelectedProject(null);
        setProjectId('');
      }).catch(err => console.error("Regional database fetch failure", err));
  }, [selectedCounty]);

  // High-precision physical hardware GPS constraint executor
  const calibrateAndVerifyLocation = (onSuccess, onFailure) => {
    if (!navigator.geolocation) {
      alert("Geospatial positioning hardware is unavailable on this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => onSuccess(position.coords.latitude, position.coords.longitude),
      (error) => onFailure(error),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const handleInitiateCameraCapture = () => {
    if (!projectId) {
      setErrorMsg('Select a target public work asset card before capturing telemetry.');
      return;
    }
    setIsCalibrating(true);
    setErrorMsg('');
    setScanResult(null);

    calibrateAndVerifyLocation(
      (lat, lng) => {
        setCalibratedCoords({ latitude: lat, longitude: lng });
        setIsCalibrating(false);
        if (cameraInputRef.current) cameraInputRef.current.click();
      },
      (error) => {
        setIsCalibrating(false);
        setCalibratedCoords(null);
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMsg('Hardware Lock Blocked: Active location verification is mandatory to mitigate fraudulent data entries.');
        } else {
          setErrorMsg('Calibration Lifecycle Failure: Satellites took too long to resolve high-accuracy locks.');
        }
      }
    );
  };

  const handleFileSelectionChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSelectProject = (proj) => {
    setSelectedProject(proj);
    setProjectId(proj.id.toString());
    setScanResult(null);
    setErrorMsg('');
    setCalibratedCoords(null);
    setSelectedFile(null);
  };

  // Execution engine processing logic
  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile || !calibratedCoords) {
      setErrorMsg('Telemetry payload missing: Capture verified project photo first.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setScanResult(null);

    const transactionId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // STAGE 1: Write-Ahead Record Generation to IndexedDB
    try {
      const db = await initIndexedDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        id: transactionId,
        projectId,
        logType,
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        fileBlob: selectedFile,
        latitude: calibratedCoords.latitude,
        longitude: calibratedCoords.longitude,
        timestamp: Date.now(),
        status: 'pending'
      });
      setOfflineCount(prev => prev + 1);
    } catch (idbErr) {
      console.error("Local hardware staging ledger failed:", idbErr);
    }

    // STAGE 2: Direct Uplink Pipeline Attempt
    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('log_type', logType);
    formData.append('latitude', calibratedCoords.latitude);
    formData.append('longitude', calibratedCoords.longitude);
    formData.append('files', selectedFile);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/verify`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.error) {
        setErrorMsg(response.data.error);
      } else {
        setScanResult(response.data);
        // Clean processed transactional record upon confirmed handshake
        const db = await initIndexedDB();
        db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(transactionId);
        setOfflineCount(prev => Math.max(0, prev - 1));
        setSelectedFile(null);
        setCalibratedCoords(null);
      }
    } catch (err) {
      // NETWORK COLLAPSE PROTECTION: Intercept crash and gracefully retain cache
      setErrorMsg('Network congestion/offline status detected. Audit staged safely to device storage cache. Will auto-sync when online.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '25px', fontFamily: 'system-ui, sans-serif', maxWidth: '1200px', margin: '0 auto', color: '#2d3748' }}>

      {/* Brand Header */}
      <header style={{ marginBottom: '30px', borderBottom: '3px solid #e2e8f0', paddingBottom: '15px' }}>
        <h1 style={{ color: '#1a202c', margin: 0, fontSize: '2.4rem', fontWeight: '900', letterSpacing: '-0.5px' }}>
          P.O.A. Registry
        </h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
          <p style={{ color: '#4a5568', margin: 0, fontWeight: '500' }}>Project Oversight & Accountability Registry</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {offlineCount > 0 && (
              <span style={{ background: '#feebc8', color: '#c05621', fontSize: '0.8rem', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold', border: '1px solid #fbd38d' }}>
                📦 {offlineCount} Unsaved Audits in Cache
              </span>
            )}
            <em style={{ color: '#3182ce', fontWeight: '700', fontSize: '0.95rem' }}>“Ukiwa na P.O.A. utakuwa poa.”</em>
          </div>
        </div>
      </header>

      {/* Dropdown Directory Selector */}
      <section style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '25px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div style={{ maxWidth: '350px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '700', color: '#4a5568' }}>Select County:</label>
          <select
            value={selectedCounty}
            onChange={(e) => setSelectedCounty(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e0', background: '#fff', fontSize: '1rem', fontWeight: '600', cursor: 'pointer' }}
          >
            {counties.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Dynamic Project Index Grid */}
        <h4 style={{ margin: '20px 0 10px 0', color: '#1a202c' }}>Active Public Works ({projects.length})</h4>
        {projects.length === 0 ? (
          <p style={{ color: '#a0aec0', fontStyle: 'italic', fontSize: '0.9rem' }}>No project metrics recorded inside this county yet.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
            {projects.map(proj => (
              <div
                key={proj.id}
                onClick={() => handleSelectProject(proj)}
                style={{
                  border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px', cursor: 'pointer',
                  background: projectId === proj.id.toString() ? '#ebf8ff' : '#f7fafc',
                  borderColor: projectId === proj.id.toString() ? '#3182ce' : '#e2e8f0'
                }}
              >
                <div style={{ fontWeight: '700', color: '#2d3748', fontSize: '1.05rem' }}>{proj.name}</div>
                <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#4a5568', lineHeight: '1.4' }}>
                  <div>📍 <strong>County:</strong> {proj.county}</div>
                  <div>🏛️ <strong>Constituency:</strong> {proj.constituency || 'Not Specified'}</div>
                  <div>🛡️ <strong>Ward:</strong> {proj.ward || 'Not Specified'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Geospatial Alignment Map Viewport */}
      <section style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '30px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#1a202c' }}>Geospatial Registry Visualizer</h4>
        <div style={{ height: '380px', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e0' }}>
          <MapContainer center={defaultCenter} zoom={defaultZoom} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {geoData && geoData.features && geoData.features.map((feature) => {
              const [lng, lat] = feature.geometry.coordinates;
              const { id, name, capacity, status } = feature.properties;

              return (
                <Marker key={id} position={[lat, lng]}>
                  <Popup>
                    <div style={{ fontFamily: 'sans-serif', minWidth: '160px' }}>
                      <strong style={{ display: 'block', color: '#2b6cb0', marginBottom: '4px' }}>{name}</strong>
                      <span style={{ display: 'block', fontSize: '11px', color: '#4a5568' }}>⚡ Capacity: {capacity || 'N/A'}</span>
                      <span style={{ display: 'block', fontSize: '11px', marginTop: '2px' }}>
                        Status: <strong style={{ color: status === 'Active' ? '#2f855a' : '#dd6b20' }}>{status}</strong>
                      </span>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </section>

      {/* Main Dashboard Interactive Split View */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '30px' }}>

        <div>
          {/* Deep Audit Contractor Card Panel */}
          {selectedProject && selectedProject.contractor && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px', marginBottom: '25px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <h4 style={{ margin: '0 0 12px 0', color: '#2b6cb0', borderBottom: '1px solid #edf2f7', paddingBottom: '6px' }}>Contractor Audit Details</h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem', marginBottom: '15px' }}>
                <div>
                  <span style={{ color: '#718096', display: 'block' }}>Contracting Firm:</span>
                  <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>{selectedProject.contractor.firm_name}</div>
                </div>
                <div>
                  <span style={{ color: '#718096', display: 'block' }}>NCA License Number:</span>
                  <div style={{ fontWeight: '700', fontFamily: 'monospace' }}>{selectedProject.contractor.license}</div>
                </div>
              </div>

              {/* Historic Portfolio Cross-Links */}
              <div style={{ background: '#f7fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontWeight: '700', fontSize: '0.8rem', color: '#4a5568' }}>Past Executed Projects Portfolio:</span>
                {!selectedProject.contractor.past_portfolio || selectedProject.contractor.past_portfolio.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '4px' }}>No historic performance logs registered for this firm.</div>
                ) : (
                  <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', fontSize: '0.8rem' }}>
                    {selectedProject.contractor.past_portfolio.map((past, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>
                        <a href={`#/archive/contractor/${selectedProject.contractor.firm_name}`} style={{ color: '#3182ce', fontWeight: '600', textDecoration: 'underline' }} onClick={(e) => e.preventDefault()}>
                          {past.name} ({past.year})
                        </a>
                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: past.status === 'Completed Successfully' ? '#c6f6d5' : '#feebc8', color: past.status === 'Completed Successfully' ? '#22543d' : '#a0522d' }}>
                          {past.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Verification Photo Upload Form */}
          <div style={{ background: '#fff', padding: '25px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, color: '#2d3748' }}>Submit Verification Telemetry</h3>

            {!consentGranted ? (
              <div style={{ background: '#ebf8ff', border: '1px solid #cbd5e0', padding: '15px', borderRadius: '8px' }}>
                <h5 style={{ margin: '0 0 8px 0', color: '#2b6cb0', fontSize: '1rem', fontWeight: '700' }}>🔒 Secure Audit Verification Disclosure</h5>
                <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#4a5568', lineHeight: '1.4' }}>
                  To maintain data integrity and prevent fraud, P.O.A. Registry cross-references your snapshot with active GPS hardware configurations.
                </p>
                <ul style={{ margin: '0 0 12px 0', paddingLeft: '20px', fontSize: '0.8rem', color: '#4a5568' }}>
                  <li style={{ marginBottom: '4px' }}><strong>Camera Interface:</strong> Records asset conditions.</li>
                  <li style={{ marginBottom: '4px' }}><strong>GPS Telemetry:</strong> Asserts baseline site proximity bounds.</li>
                </ul>
                <button type="button" onClick={() => setConsentGranted(true)} style={{ width: '100%', padding: '10px', background: '#3182ce', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                  I Consent, Open Camera Interface
                </button>
              </div>
            ) : (
              <form onSubmit={handleVerifySubmit}>
                <input type="hidden" value={projectId} required />

                {selectedProject ? (
                  <div style={{ marginBottom: '15px', padding: '10px', background: '#f7fafc', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '0.9rem' }}>
                    Selected Project: <strong style={{ color: '#2b6cb0' }}>{selectedProject.name}</strong>
                  </div>
                ) : (
                  <div style={{ marginBottom: '15px', padding: '10px', background: '#fff5f5', borderRadius: '6px', border: '1px solid #fed7d7', fontSize: '0.9rem', color: '#c53030', fontWeight: '600' }}>
                    ⚠️ Please tap/select a project card from the grid above first.
                  </div>
                )}

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600' }}>Verification Context:</label>
                  <select value={logType} onChange={(e) => setLogType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e0', background: '#fff' }}>
                    <option value="public_project">Project Structural Progress</option>
                    <option value="workforce">Labor Presence Audit</option>
                    <option value="delivery">Materials On-site Audit</option>
                  </select>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600' }}>Capture Telemetry Asset:</label>

                  <button
                    type="button"
                    onClick={handleInitiateCameraCapture}
                    disabled={isCalibrating || loading || !projectId}
                    style={{
                      width: '100%', padding: '12px', background: '#2f855a', color: '#fff', border: 'none',
                      borderRadius: '6px', fontWeight: 'bold', cursor: (!projectId || isCalibrating) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isCalibrating ? '🛰️ Calibrating Satellite Locks...' : '📸 Snap Project Photo'}
                  </button>

                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={cameraInputRef}
                    onChange={handleFileSelectionChange}
                    style={{ display: 'none' }}
                  />

                  {selectedFile && (
                    <div style={{ fontSize: '0.85rem', color: '#4a5568', background: '#edf2f7', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
                      <div>📂 <strong>Staged:</strong> {selectedFile.name}</div>
                      {calibratedCoords && (
                        <div style={{ color: '#2b6cb0', fontWeight: '600', marginTop: '2px' }}>
                          📍 <strong>GPS Locked:</strong> {calibratedCoords.latitude.toFixed(5)}, {calibratedCoords.longitude.toFixed(5)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button type="submit" disabled={loading || !selectedFile} style={{ width: '100%', padding: '12px', background: (loading || !selectedFile) ? '#cbd5e0' : '#3182ce', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
                  {loading ? 'Processing GPS Metadata Matrices...' : 'Execute Audit Check'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Dynamic Verification Output Engine Status Panel */}
        <div style={{ background: '#fff', padding: '25px', borderRadius: '10px', border: '1px solid #e2e8f0', height: 'fit-content' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', paddingBottom: '8px', marginBottom: '15px' }}>
            <h3 style={{ marginTop: 0, color: '#2d3748', marginBottom: 0 }}>Audit Status Engine</h3>
            {offlineCount > 0 && (
              <button
                onClick={executeCacheSyncJob}
                disabled={isSyncing}
                style={{ padding: '4px 10px', background: '#3182ce', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {isSyncing ? 'Syncing...' : '🔄 Manual Sync Now'}
              </button>
            )}
          </div>

          {errorMsg && <div style={{ background: '#fff5f5', color: '#c53030', padding: '12px', borderRadius: '6px', border: '1px solid #fed7d7', fontSize: '0.9rem', marginBottom: '15px' }}>{errorMsg}</div>}

          {!scanResult && !errorMsg && !loading && <div style={{ border: '2px dashed #e2e8f0', padding: '50px 10px', textAlign: 'center', color: '#a0aec0', borderRadius: '6px' }}>Awaiting system transaction inputs. Select an infrastructure index card above.</div>}

          {loading && <div style={{ textAlign: 'center', color: '#3182ce', padding: '40px 0' }}><strong>Parsing EXIF Coordinates...</strong><p style={{ color: '#718096', fontSize: '0.8rem' }}>Comparing image metadata geometry values with target registry bounds.</p></div>}

          {scanResult && scanResult.results && scanResult.results.map((item, idx) => (
            <div
              key={idx}
              style={{
                background: item.status === 'VERIFIED' ? '#f0fff4' : '#fffaf0',
                padding: '18px',
                borderRadius: '8px',
                border: `1px solid ${item.status === 'VERIFIED' ? '#c6f6d5' : '#fbd38d'}`,
                marginBottom: '15px'
              }}
            >
              <h4 style={{ margin: '0 0 12px 0', fontWeight: '800', fontSize: '1rem', color: item.status === 'VERIFIED' ? '#38a169' : '#c05621' }}>
                {item.status === 'VERIFIED' ? '✅ SYSTEM SPECIFICATION ALIGNMENT MATCH' : '⚠️ DATA METRIC VARIANCE OBSERVED'}
              </h4>

              <div style={{ fontSize: '0.85rem', color: '#4a5568', lineHeight: '1.5' }}>
                <p style={{ margin: '0 0 6px 0' }}>File Handled: <strong>{item.filename}</strong></p>
                {item.status === 'VERIFIED' ? (
                  <>
                    <p style={{ margin: '0 0 4px 0' }}>Geospatial Scan: <strong style={{ color: '#2f855a' }}>{item.geospatial_audit?.status}</strong></p>
                    <p style={{ margin: '0 0 8px 0' }}>Calculated Offset: <strong>{item.geospatial_audit?.distance_meters?.toFixed(2) || 0} meters</strong> deviation.</p>
                  </>
                ) : (
                  <p style={{ margin: '0 0 8px 0', color: '#c05621' }}>Reason: <strong>{item.detail}</strong></p>
                )}

                {/* AI Privacy & Detection Layer Display */}
                {item.ai_audit && (
                  <div style={{ margin: '10px 0', padding: '8px 10px', background: '#edf2f7', borderRadius: '6px', fontSize: '0.78rem' }}>
                    <div style={{ fontWeight: '700', color: '#2b6cb0', marginBottom: '4px' }}>🤖 Computer Vision & Privacy Verification:</div>
                    <div>🛡️ Faces/Plates Redacted: <strong>{item.ai_audit.blurred_count || 0}</strong></div>
                    <div>🏗️ Objects Detected: <strong>{item.ai_audit.detected_objects?.join(', ') || 'Standard Inspection Asset'}</strong></div>
                  </div>
                )}

                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#718096' }}>
                  <div style={{ fontWeight: '700', color: '#4a5568', marginBottom: '3px' }}>🛡️ Data Provenance Pipeline Lineage:</div>
                  <p style={{ margin: '0 0 4px 0' }}>Session Anchor Sign: <code style={{ background: '#edf2f7', padding: '2px 4px', borderRadius: '4px' }}>{scanResult.summary?.anonymous_session_signature}</code></p>
                  <a href="https://api.treasury.go.ke" target="_blank" rel="noreferrer" style={{ color: '#3182ce', fontWeight: '600', textDecoration: 'underline' }}>
                    Verify External Source Registries ↗
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default App;