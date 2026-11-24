import IORedis from 'ioredis';

const options = { host: 'localhost', port: 6379 };

// Workers: BullMQ requires maxRetriesPerRequest: null, and they should keep retrying until Redis is back.
export const workerConnection = new IORedis({ ...options, maxRetriesPerRequest: null });

// Producers (the API): fail fast when Redis is down instead of hanging the HTTP request.
export const producerConnection = new IORedis({ ...options, maxRetriesPerRequest: 1, enableOfflineQueue: false });

export default workerConnection; // existing worker imports keep working unchanged