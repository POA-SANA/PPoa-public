# Project Oversight & Accountability (P.O.A.) Registry
## Technical Overview, Operational Architecture, and Deployment Report

---

## Executive Summary

The **Project Oversight & Accountability (P.O.A.) Registry** is a civic-tech platform designed to enable community-driven auditing and verification of public infrastructure projects. By integrating high-precision geospatial tracking, real-time computer vision (YOLOv8), automated privacy redaction (OpenCV), and offline-first storage capabilities, the registry provides an untamperable audit trail for public infrastructure investments and resource allocations.

Given the sensitive nature of civic monitoring, the system enforces a strict **privacy-first operational model**, ensuring field auditors remain anonymous while maintaining full verifiability of submitted site data.

---

## System Architecture

The project utilizes a decoupled, resilient architecture designed to function across variable network connectivity environments:

```
[ Field Auditor / Device ]
           │
           ├── (Offline-First Capture via IndexedDB)
           ▼
[ React + Vite Frontend (Port 5173) ]
           │
           ├── REST API Requests (JSON + Multipart Form Data)
           ▼
[ FastAPI Backend (Port 8000) ]
           │
           ├──► [ Privacy Shield (OpenCV) ] ── (Face & Plate Redaction)
           ├──► [ Asset Detector (YOLOv8) ] ── (Site Feature Extraction)
           │
           ▼
[ PostgreSQL Database (`poa_registry`) ]
           │
           └── [ `audit_logs` Table / Offline Sync Engine ]

### Core Technologies
* **Frontend:** React, Vite, Tailwind CSS, Lucide Icons, IndexedDB (Offline Cache).
* **Backend:** Python 3.x, FastAPI, Uvicorn.
* **Computer Vision & AI:** OpenCV (Automated blurring), Ultralytics YOLOv8 (Construction asset identification).
* **Database & Persistence:** PostgreSQL

[Architecture Overview](architecture.md)