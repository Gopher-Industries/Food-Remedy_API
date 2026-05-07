const queue = [];

function addToQueue(action) {
  queue.push({
    ...action,
    id: `${action.type || "ACTION"}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    timestamp: Date.now(),
    retries: 0,
    maxRetries: 3,
    status: "pending",
    lastError: null
  });
}

function getQueue() {
  return queue;
}

function clearQueue() {
  queue.length = 0;
}

function removeFromQueue(actionId) {
  const index = queue.findIndex((item) => item.id === actionId);
  if (index !== -1) {
    queue.splice(index, 1);
    return true;
  }
  return false;
}

function updateQueueItem(actionId, updates) {
  const item = queue.find((entry) => entry.id === actionId);
  if (!item) return null;

  Object.assign(item, updates);
  return item;
}

module.exports = {
  addToQueue,
  getQueue,
  clearQueue,
  removeFromQueue,
  updateQueueItem
};