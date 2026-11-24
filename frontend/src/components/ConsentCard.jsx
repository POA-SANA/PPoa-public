import React from 'react';

export default function ConsentCard({ onAccept }) {
    return (
        <div style={{ background: '#ebf8ff', border: '1px solid #cbd5e0', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#2b6cb0', fontSize: '1.1rem', fontWeight: '700' }}>
                🔒 Hardware Authorization & Legal Consent Disclosure
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.88rem', color: '#4a5568', lineHeight: '1.5' }}>
                To maintain audit integrity and satisfy statutory compliance standards, P.O.A. Registry cross-references your submission with device hardware coordinates.
            </p>
            <ul style={{ margin: '0 0 16px 0', paddingLeft: '20px', fontSize: '0.85rem', color: '#4a5568', lineHeight: '1.4' }}>
                <li style={{ marginBottom: '6px' }}><strong>Camera Access:</strong> Captures physical asset conditions on-site.</li>
                <li style={{ marginBottom: '6px' }}><strong>GPS Positioning:</strong> Asserts baseline site proximity bounds to prevent remote fraudulent submissions.</li>
            </ul>
            <button
                type="button"
                onClick={onAccept}
                style={{
                    width: '100%',
                    padding: '12px',
                    background: '#3182ce',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    fontSize: '0.95rem',
                    cursor: 'pointer'
                }}
            >
                I Consent, Unlock Camera & GPS
            </button>
        </div>
    );
}