import axios from 'axios';
import { getStagedRecords, clearStagedRecord } from './offlineDb';

export async function processPendingOfflineQueue(setOfflineCount) {
    try {
        const pendingRecords = await getStagedRecords();

        if (!pendingRecords || pendingRecords.length === 0) {
            if (setOfflineCount) setOfflineCount(0);
            return;
        }

        console.log(`🌐 Network online! Syncing ${pendingRecords.length} pending record(s)...`);
        const API_BASE_URL = `http://${window.location.hostname}:8000`;

        for (const record of pendingRecords) {
            try {
                const formData = new FormData();
                formData.append('project_id', record.projectId);
                formData.append('log_type', record.logType);
                formData.append('files', record.fileBlob, record.fileName);
                formData.append('client_timestamp', record.timestamp.toString());
                formData.append('payload_hash', record.payloadHash);

                const response = await axios.post(`${API_BASE_URL}/api/verify`, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'X-Idempotency-Key': record.id
                    }
                });

                if (response.status === 200) {
                    // Successfully synced -> delete from local storage
                    await clearStagedRecord(record.id);
                    console.log(`✅ Synced transaction: ${record.id}`);
                }
            } catch (err) {
                console.warn(`⏳ Stored record ${record.id} will retry on next connection cycle.`);
            }
        }

        // Refresh pending count badge
        const remaining = await getStagedRecords();
        if (setOfflineCount) setOfflineCount(remaining.length);

    } catch (error) {
        console.error("Error running background sync cycle:", error);
    }
}