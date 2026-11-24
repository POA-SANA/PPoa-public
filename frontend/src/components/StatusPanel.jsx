import React from 'react';

export default function StatusPanel({ loading, errorMsg, scanResult, offlineCount, isSyncing, onSync }) {
    return (
        <div style={{ background: '#fff', padding: '25px', borderRadius: '10px', border: '1px solid #e2e8f0', height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', paddingBottom: '8px', marginBottom: '15px' }}>
                <h3 style={{ marginTop: 0, color: '#2d3748', marginBottom: 0 }}>Audit Status Engine</h3>
                {offlineCount > 0 && (
                    <button
                        onClick={onSync}
                        disabled={isSyncing}
                        style={{ padding: '6px 12px', background: '#3182ce', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        {isSyncing ? 'Syncing...' : '🔄 Sync Cached Reports'}
                    </button>
                )}
            </div>

            {errorMsg && <div style={{ background: '#fff5f5', color: '#c53030', padding: '12px', borderRadius: '6px', border: '1px solid #fed7d7', fontSize: '0.9rem', marginBottom: '15px' }}>{errorMsg}</div>}

            {!scanResult && !errorMsg && !loading && <div style={{ border: '2px dashed #e2e8f0', padding: '50px 10px', textAlign: 'center', color: '#a0aec0', borderRadius: '6px' }}>Awaiting project selection and photo capture.</div>}

            {loading && <div style={{ textAlign: 'center', color: '#3182ce', padding: '40px 0' }}><strong>Parsing EXIF & Telemetry...</strong></div>}

            {scanResult && scanResult.results && scanResult.results.map((item, idx) => (
                <div key={idx} style={{ background: item.status === 'VERIFIED' ? '#f0fff4' : '#fffaf0', padding: '18px', borderRadius: '8px', border: `1px solid ${item.status === 'VERIFIED' ? '#c6f6d5' : '#fbd38d'}` }}>
                    <h4 style={{ margin: '0 0 12px 0', fontWeight: '800', color: item.status === 'VERIFIED' ? '#38a169' : '#c05621' }}>
                        {item.status === 'VERIFIED' ? '✅ SYSTEM SPECIFICATION MATCH' : '⚠️ METRIC VARIANCE DETECTED'}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#4a5568' }}>File: <strong>{item.filename}</strong></p>
                </div>
            ))}
        </div>
    );
}