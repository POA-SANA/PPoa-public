import React, { useState, useRef } from 'react';
import axios from 'axios';
import { stageRecordLocally } from '../services/offlineDb';
import { generateTransientHash } from '../services/crypto';

export default function TelemetryForm({ selectedProject, setOfflineCount, setLoading, setErrorMsg, setScanResult }) {
    const [logType, setLogType] = useState('public_project');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [calibratedCoords, setCalibratedCoords] = useState(null);
    const [showPermissionModal, setShowPermissionModal] = useState(false);

    const cameraInputRef = useRef(null);

    // Triggered when user clicks "Snap Project Photo"
    const handlePhotoClick = () => {
        if (!selectedProject) {
            setErrorMsg('Please select a project card above before snapping a photo.');
            return;
        }
        setErrorMsg('');
        setScanResult(null);
        // Show user-friendly permission modal first
        setShowPermissionModal(true);
    };

    // User clicked "Decline" -> cancel completely, do not open camera
    const handleDeclinePermission = () => {
        setShowPermissionModal(false);
    };

    // User clicked "Allow" -> request location then open camera
    const handleAcceptPermission = () => {
        setShowPermissionModal(false);
        setIsCalibrating(true);

        if (!navigator.geolocation) {
            setIsCalibrating(false);
            setErrorMsg("Your browser does not support location services.");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setCalibratedCoords({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
                setIsCalibrating(false);

                // Open camera / file selection immediately after location is obtained
                if (cameraInputRef.current) {
                    cameraInputRef.current.click();
                }
            },
            (error) => {
                setIsCalibrating(false);
                setCalibratedCoords(null);
                setErrorMsg('Location access was denied. Location is required to verify site photo updates.');
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
    };

    const handleVerifySubmit = async (e) => {
        e.preventDefault();
        if (!selectedFile || !calibratedCoords) {
            setErrorMsg('Missing photo or location. Please snap a project photo first.');
            return;
        }

        setLoading(true);
        setErrorMsg('');
        setScanResult(null);

        const transactionId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const currentTimestamp = Date.now();
        const transientToken = window.sessionStorage.getItem('x_transient_token') || 'temp_seed_token';

        const payloadHash = await generateTransientHash(
            selectedProject.id,
            calibratedCoords.latitude,
            calibratedCoords.longitude,
            currentTimestamp,
            transientToken
        );

        // Write-Ahead Staging in IndexedDB
        try {
            await stageRecordLocally({
                id: transactionId,
                projectId: selectedProject.id,
                logType,
                fileName: selectedFile.name,
                fileType: selectedFile.type,
                fileBlob: selectedFile,
                latitude: calibratedCoords.latitude,
                longitude: calibratedCoords.longitude,
                timestamp: currentTimestamp,
                payloadHash,
                status: 'pending'
            });
            setOfflineCount(prev => prev + 1);
        } catch (err) {
            console.error("Local staging failed:", err);
        }

        // Direct API Transmission
        const formData = new FormData();
        formData.append('project_id', selectedProject.id);
        formData.append('log_type', logType);
        formData.append('files', selectedFile);
        formData.append('client_timestamp', currentTimestamp.toString());
        formData.append('payload_hash', payloadHash);

        try {
            const response = await axios.post('http://127.0.0.1:8000/api/verify', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'X-Idempotency-Key': transactionId
                },
            });

            if (response.data.error) {
                setErrorMsg(response.data.error);
            } else {
                setScanResult(response.data);
                setSelectedFile(null);
                setCalibratedCoords(null);
            }
        } catch (err) {
            setErrorMsg('Network issue detected. Report safely cached in local storage and queued for background sync.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ background: '#fff', padding: '25px', borderRadius: '10px', border: '1px solid #e2e8f0', position: 'relative' }}>
            <h3 style={{ marginTop: 0, color: '#2d3748' }}>Submit Verification Telemetry</h3>

            <form onSubmit={handleVerifySubmit}>
                {selectedProject ? (
                    <div style={{ marginBottom: '15px', padding: '10px', background: '#f7fafc', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '0.9rem' }}>
                        Selected Project: <strong style={{ color: '#2b6cb0' }}>{selectedProject.name}</strong>
                    </div>
                ) : (
                    <div style={{ marginBottom: '15px', padding: '10px', background: '#fff5f5', borderRadius: '6px', border: '1px solid #fed7d7', fontSize: '0.9rem', color: '#c53030', fontWeight: '600' }}>
                        ⚠️ Select a project card from the list above first.
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
                        onClick={handlePhotoClick}
                        disabled={isCalibrating || !selectedProject}
                        style={{
                            width: '100%', padding: '12px', background: '#2f855a', color: '#fff', border: 'none',
                            borderRadius: '6px', fontWeight: 'bold', cursor: (!selectedProject || isCalibrating) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {isCalibrating ? '🛰️ Getting Location...' : '📸 Snap Project Photo'}
                    </button>

                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        ref={cameraInputRef}
                        onChange={(e) => e.target.files && setSelectedFile(e.target.files[0])}
                        style={{ display: 'none' }}
                    />

                    {selectedFile && (
                        <div style={{ fontSize: '0.85rem', color: '#4a5568', background: '#edf2f7', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
                            <div>📂 Selected File: <strong>{selectedFile.name}</strong></div>
                            {calibratedCoords && (
                                <div style={{ color: '#2b6cb0', fontWeight: '600', marginTop: '2px' }}>
                                    📍 Location Saved ({calibratedCoords.latitude.toFixed(4)}, {calibratedCoords.longitude.toFixed(4)})
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <button type="submit" disabled={!selectedFile} style={{ width: '100%', padding: '12px', background: !selectedFile ? '#cbd5e0' : '#3182ce', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: !selectedFile ? 'not-allowed' : 'pointer' }}>
                    Execute Audit Check
                </button>
            </form>

            {/* Non-Technical Permission Dialog */}
            {showPermissionModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#fff',
                        borderRadius: '12px',
                        padding: '25px',
                        maxWidth: '420px',
                        width: '100%',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
                    }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: '#1a202c' }}>
                            📍 Allow Location Access?
                        </h4>
                        <p style={{ margin: '0 0 20px 0', fontSize: '0.95rem', color: '#4a5568', lineHeight: '1.5' }}>
                            To verify that this photo is taken directly at the project site, we need to attach your current location.
                        </p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={handleDeclinePermission}
                                style={{
                                    padding: '10px 16px',
                                    background: '#edf2f7',
                                    color: '#4a5568',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                Decline
                            </button>
                            <button
                                type="button"
                                onClick={handleAcceptPermission}
                                style={{
                                    padding: '10px 16px',
                                    background: '#3182ce',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                Allow & Take Photo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}