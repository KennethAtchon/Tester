// One JSON document kept in two places: a file written through the preload
// bridge (debounced), and a synchronous localStorage mirror so nothing is lost
// if the window closes mid-debounce. On load the newer copy (by savedAt) wins.

export function persistedDocument({ storageKey, load, save, delay = 300 }) {
  let timer = null;

  const readLocal = () => {
    try {
      const text = localStorage.getItem(storageKey);
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  };

  const writeLocal = (data) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // Quota or privacy mode: the file copy is the source of truth.
    }
  };

  return {
    async read() {
      let fromFile = null;
      try {
        const text = await load();
        fromFile = text ? JSON.parse(text) : null;
      } catch {
        fromFile = null;
      }
      const candidates = [fromFile, readLocal()].filter(Boolean);
      candidates.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      return candidates[0] || null;
    },

    write(data) {
      data.savedAt = Date.now();
      writeLocal(data);
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        Promise.resolve()
          .then(() => save(JSON.stringify(data)))
          .catch(() => {
            // The localStorage mirror still holds the latest state.
          });
      }, delay);
    }
  };
}
