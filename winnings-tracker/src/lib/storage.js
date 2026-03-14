// Web-based storage using localStorage

export const loadWinnings = async (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load winnings', e);
    return [];
  }
};

export const saveWinnings = async (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save winnings', e);
  }
};
