/**
 * Generates a client-side SHA-256 transient hash to sign audit submissions.
 * 
 * @param {string|number} projectId 
 * @param {number} latitude 
 * @param {number} longitude 
 * @param {number} timestamp 
 * @param {string} transientToken 
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function generateTransientHash(projectId, latitude, longitude, timestamp, transientToken) {
    const rawPayloadString = `${projectId}|${latitude}|${longitude}|${timestamp}|${transientToken}`;
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(rawPayloadString);

    // Generate SHA-256 digest using Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    // Convert buffer array to hex string
    return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}