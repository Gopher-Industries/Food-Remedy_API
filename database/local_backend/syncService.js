const {
  getQueue,
  removeFromQueue,
  updateQueueItem
} = require("./syncQueue");

const MAX_RETRIES = 3;

function isNetworkAvailable() {
  return true;
}

async function syncToFirebase(action) {
  if (!action || !action.type) {
    throw new Error("Invalid sync action");
  }

  if (!isNetworkAvailable()) {
    throw new Error("Network unavailable");
  }

  return {
    success: true,
    actionType: action.type,
    syncedAt: new Date().toISOString()
  };
}

function resolveConflict(localRecord, remoteRecord) {
  if (!remoteRecord) {
    return {
      resolved: localRecord,
      strategy: "local_only"
    };
  }

  if (!localRecord) {
    return {
      resolved: remoteRecord,
      strategy: "remote_only"
    };
  }

  const localUpdatedAt = new Date(localRecord.updatedAt || 0).getTime();
  const remoteUpdatedAt = new Date(remoteRecord.updatedAt || 0).getTime();

  if (localUpdatedAt >= remoteUpdatedAt) {
    return {
      resolved: localRecord,
      strategy: "latest_local_wins"
    };
  }

  return {
    resolved: remoteRecord,
    strategy: "latest_remote_wins"
  };
}

async function processQueue() {
  const queueSnapshot = [...getQueue()];
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const item of queueSnapshot) {
    if (item.status === "failed") {
      skippedCount++;
      continue;
    }

    try {
      await syncToFirebase(item);

      updateQueueItem(item.id, {
        status: "synced",
        lastError: null
      });

      removeFromQueue(item.id);
      successCount++;
    } catch (error) {
      const newRetries = (item.retries || 0) + 1;
      const isPermanentlyFailed = newRetries >= (item.maxRetries || MAX_RETRIES);

      updateQueueItem(item.id, {
        retries: newRetries,
        status: isPermanentlyFailed ? "failed" : "pending",
        lastError: error.message
      });

      if (isPermanentlyFailed) {
        failedCount++;
      }
    }
  }

  return {
    successCount,
    failedCount,
    skippedCount,
    remainingInQueue: getQueue().length
  };
}

module.exports = {
  syncToFirebase,
  resolveConflict,
  processQueue,
  isNetworkAvailable
};