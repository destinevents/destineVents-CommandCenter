function storageGet(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch { return fallback; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

function storageRemove(key) {
  try { localStorage.removeItem(key); return true; }
  catch { return false; }
}

function storageGetString(key, fallback) {
  try { return localStorage.getItem(key) || fallback; }
  catch { return fallback; }
}

function storageSetString(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch { return false; }
}
