import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix for Leaflet default marker icons breaking in modern bundlers like Vite
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export default function ProjectMap({ geoData }) {
    const defaultCenter = [-0.5200, 36.9500]; // Regional center coordinates
    const defaultZoom = 9;

    return (
        <section style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '30px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#1a202c', fontSize: '1.1rem' }}>Geospatial Registry Visualizer</h4>
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
                            <Marker key={id || `${lat}-${lng}`} position={[lat, lng]}>
                                <Popup>
                                    <div style={{ fontFamily: 'sans-serif', minWidth: '160px' }}>
                                        <strong style={{ display: 'block', color: '#2b6cb0', marginBottom: '4px' }}>{name}</strong>
                                        <span style={{ display: 'block', fontSize: '11px', color: '#4a5568' }}>⚡ Capacity: {capacity || 'N/A'}</span>
                                        <span style={{ display: 'block', fontSize: '11px', marginTop: '2px' }}>
                                            Status: <strong style={{ color: status === 'Active' ? '#2f855a' : '#dd6b20' }}>{status || 'Monitored'}</strong>
                                        </span>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>
        </section>
    );
}