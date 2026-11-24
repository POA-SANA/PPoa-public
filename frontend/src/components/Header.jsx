import React from 'react';

export default function Header({ offlineCount }) {
    return (
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
    );
}