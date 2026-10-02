import React, { useEffect, useState } from 'react';
import { Parser } from 'expr-eval';
import { loadWinnings, saveWinnings, requestPersistentStorage } from '../lib/storage';
import { defaultSampleWinnings, defaultSelections } from '../lib/mockData';
import settings from '../lib/settings';
import './WinningTracker.css';

const STORAGE_KEY = 'WINWIN_WINNINGS';
const SELECTIONS_KEY = 'WINWIN_SELECTIONS';

// Dev mode starts with sample platforms/brands/categories; production starts empty
// so everything comes from what the user enters.
const emptySelections = { platforms: [], brands: [], categories: [] };
const initialSelections = settings.isDev ? defaultSelections : emptySelections;

const monthColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
  '#F8B739', '#52B788', '#E76F51', '#2A9D8F'
];

const priceParser = new Parser();

// Evaluate a price expression like "20+15" or "3*12.5".
// Returns a number, or null if the input is empty or not a valid arithmetic expression.
// Only digits, whitespace and + - * / ( ) . are allowed, so nothing else reaches the parser.
const evaluatePrice = (expr) => {
  if (typeof expr === 'number') return Number.isFinite(expr) ? expr : null;
  const s = String(expr ?? '').trim();
  if (!s || !/^[\d\s+\-*/().]+$/.test(s)) return null;
  try {
    const value = Number(priceParser.evaluate(s));
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  } catch {
    return null;
  }
};

// Return a YYYY-MM-DD string using local date components (avoids UTC timezone shifts)
const formatLocalDate = (input) => {
  if (!input) return '';
  if (typeof input === 'string') {
    // If it's an ISO-like string with T, prefer parsing to local components to be safe
    const isoPart = input.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoPart)) return isoPart;
    // fallback: try to parse and format
    const dt = new Date(input);
    if (!isNaN(dt)) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return isoPart;
  }
  if (input instanceof Date) {
    const dt = input;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // last resort
  try {
    const dt = new Date(input);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch {
    return String(input).substring(0, 10);
  }
};

// Clean up items from storage or a backup file: consistent date/month strings and numeric price.
const normalizeWinnings = (arr) => (arr || []).map(e => {
  const dateStr = formatLocalDate(e.date || (e.month ? `${e.month}-01` : undefined) || new Date());
  return {
    ...e,
    date: dateStr,
    month: dateStr.substring(0, 7),
    price: Number(e.price) || 0
  };
});

const isValidSelections = (v) =>
  v && !Array.isArray(v) &&
  Array.isArray(v.platforms) && Array.isArray(v.brands) && Array.isArray(v.categories);

const groupByMonth = (items) => {
  const map = {};
  items.forEach(e => {
    const m = e.month || (e.date ? e.date.substring(0, 7) : 'unknown');
    if (!map[m]) map[m] = [];
    map[m].push(e);
  });
  return map;
};

const getAvailableYears = (items) => {
  const currentYear = String(new Date().getFullYear());
  const years = new Set([currentYear]);
  items.forEach(e => {
    const year = e.month ? e.month.substring(0, 4) : (e.date ? e.date.substring(0, 4) : null);
    if (year) years.add(year);
  });
  return Array.from(years).sort().reverse();
};

const filterByYear = (items, year) => {
  return items.filter(e => {
    const itemYear = e.month ? e.month.substring(0, 4) : (e.date ? e.date.substring(0, 4) : null);
    return itemYear === String(year);
  });
};

const parseLocalDate = (dateStr) => {
  if (!dateStr) return new Date(NaN);

  // If already a Date, just return it.
  if (dateStr instanceof Date) return dateStr;

  const s = String(dateStr).split('T')[0];
  const parts = s.split('-');

  // If string looks like YYYY-MM-DD, create a local Date to avoid UTC timezone shifts.
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  // Fallback: try Date constructor and return it.
  const dt = new Date(dateStr);
  return isNaN(dt) ? new Date(NaN) : dt;
};

const filterByDateRange = (items, startDate, endDate) => {
  return items.filter(e => {
    const date = parseLocalDate(e.date);
    return date >= startDate && date <= endDate;
  });
};

const getMonthLabel = (monthStr) => {
  if (!monthStr) return '';
  // Accept either 'YYYY-MM' or 'YYYY-MM-DD' or other date-like strings
  const m = String(monthStr).split('T')[0];
  const monthOnly = m.length >= 7 ? m.substring(0, 7) : m;
  const [y, mo] = monthOnly.split('-');
  const yearNum = Number(y) || new Date().getFullYear();
  const monthNum = Number(mo) || 1;
  return new Date(yearNum, monthNum - 1, 1).toLocaleDateString(undefined, { month: 'short' });
};

// Rank options by how often they appear in `items[field]`, breaking ties by most recent use.
const rankByUsage = (options, items, field) => {
  const stats = {};
  items.forEach(i => {
    const key = i[field];
    if (!key) return;
    const st = stats[key] || (stats[key] = { count: 0, last: '' });
    st.count += 1;
    if ((i.date || '') > st.last) st.last = i.date || '';
  });
  return [...options].sort((a, b) => {
    const sa = stats[a] || { count: 0, last: '' };
    const sb = stats[b] || { count: 0, last: '' };
    return sb.count - sa.count || sb.last.localeCompare(sa.last);
  });
};

// Text input with tappable suggestion chips underneath. Replaces <datalist>, which
// iOS Safari only shows as a single keyboard suggestion instead of a list.
// `options` should already be ranked (most used first). With an empty input only the
// top `limit` chips are shown plus a "+N more" chip; typing searches all options.
function ComboInput({ value, onChange, options, placeholder, limit = 8 }) {
  const [showAll, setShowAll] = useState(false);
  const text = value || '';
  const q = text.trim().toLowerCase();
  const exact = options.some(o => o.toLowerCase() === q);

  let matches = [];
  let hidden = 0;
  if (!exact) {
    if (q) {
      const starts = options.filter(o => o.toLowerCase().startsWith(q));
      const contains = options.filter(o => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q));
      matches = [...starts, ...contains].slice(0, 8);
    } else if (showAll || options.length <= limit) {
      matches = options;
    } else {
      matches = options.slice(0, limit);
      hidden = options.length - limit;
    }
  }

  return (
    <>
      <input
        type="text"
        className="form-input"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        placeholder={placeholder}
        value={text}
        onChange={e => onChange(e.target.value)}
      />
      {matches.length > 0 && (
        <div className="chip-row">
          {matches.map(o => (
            <button key={o} type="button" className="chip" onClick={() => onChange(o)}>
              {o}
            </button>
          ))}
          {hidden > 0 && (
            <button type="button" className="chip chip-more" onClick={() => setShowAll(true)}>
              +{hidden} more
            </button>
          )}
        </div>
      )}
    </>
  );
}

export default function WinningTracker() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  const [activeTab, setActiveTab] = useState('main');
  const [winnings, setWinnings] = useState([]);
  const [selections, setSelections] = useState(initialSelections);
  // Becomes true once stored data has been loaded; saves are skipped until then
  // so the initial default state never overwrites what's in storage.
  const [loaded, setLoaded] = useState(false);
  const [storagePersistent, setStoragePersistent] = useState(null); // true | false | null (unknown)
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [analysisRange, setAnalysisRange] = useState('month');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [editingSelection, setEditingSelection] = useState(null); // { type, index, value }
  const [form, setForm] = useState({
    date: formatLocalDate(new Date()),
    platform: '',
    brand: '',
    category: '',
    item: '',
    price: ''
  });

  useEffect(() => {
    (async () => {
      // Load stored winnings if present; otherwise use default sample data (only in dev mode).
      const stored = await loadWinnings(STORAGE_KEY);
      const normalize = normalizeWinnings;

      if (settings.isDev === true) {
        // In dev mode, use mock data if no stored data
        if (stored && stored.length > 0) {
          const norm = normalize(stored);
          setWinnings(norm);
          await saveWinnings(STORAGE_KEY, norm);
        } else {
          const normDefault = normalize(defaultSampleWinnings);
          setWinnings(normDefault);
          await saveWinnings(STORAGE_KEY, normDefault);
        }
      } else {
        // In production, only use stored data
        if (stored && stored.length > 0) {
          const norm = normalize(stored);
          setWinnings(norm);
        } else {
          setWinnings([]);
        }
      }

      const storedSelections = await loadWinnings(SELECTIONS_KEY);
      // loadWinnings returns [] when nothing is stored, so check the shape before using it
      if (isValidSelections(storedSelections)) {
        setSelections(storedSelections);
      }

      setLoaded(true);
      setStoragePersistent(await requestPersistentStorage());
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveWinnings(STORAGE_KEY, winnings);
  }, [winnings, loaded]);

  useEffect(() => {
    if (!loaded) return;
    saveWinnings(SELECTIONS_KEY, selections);
  }, [selections, loaded]);

  const addNewSelection = (type, value) => {
    if (value && !selections[type].includes(value)) {
      setSelections(prev => ({
        ...prev,
        [type]: [...prev[type], value]
      }));
    }
  };

  const addSelection = (type, value) => {
    if (value && !selections[type].includes(value)) {
      setSelections(prev => ({
        ...prev,
        [type]: [...prev[type], value]
      }));
    }
  };

  const updateSelection = (type, index, newValue) => {
    if (newValue && !selections[type].some((item, i) => i !== index && item === newValue)) {
      setSelections(prev => ({
        ...prev,
        [type]: prev[type].map((item, i) => i === index ? newValue : item)
      }));
    }
  };

  const deleteSelection = (type, index) => {
    setSelections(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  // Trim the value and reuse an existing option's spelling if it matches ignoring case,
  // so "dior" doesn't become a second entry next to "Dior".
  const canonical = (type, value) => {
    const v = String(value || '').trim();
    return selections[type].find(o => o.toLowerCase() === v.toLowerCase()) || v;
  };

  const handleSubmit = () => {
    if (!form.date || !form.platform || !form.brand || !form.category || !form.item || !form.price) {
      alert('Missing fields: Please fill in all fields');
      return;
    }
    
    const price = evaluatePrice(form.price);
    if (price === null) {
      alert('Invalid price: use numbers and + - * / ( ), e.g. 20+15');
      return;
    }

    const platform = canonical('platforms', form.platform);
    const brand = canonical('brands', form.brand);
    const category = canonical('categories', form.category);
    addNewSelection('platforms', platform);
    addNewSelection('brands', brand);
    addNewSelection('categories', category);
    // normalize date to YYYY-MM-DD string using local components to avoid timezone shifting
    const dateStr = formatLocalDate(form.date);
    const newWin = {
      id: Date.now(),
      date: dateStr,
      platform,
      brand,
      category,
      item: form.item,
      price,
      month: dateStr.substring(0, 7)
    };

    setWinnings(prev => {
      const next = [...prev, newWin];
      return next;
    });

    // If the month modal is open for the same month, update its items so the UI refreshes
    if (editing && editing.month === newWin.month) {
      setEditing(prev => ({ month: prev.month, items: [...(prev.items || []), newWin] }));
    }

    setForm({ date: formatLocalDate(new Date()), platform: '', brand: '', category: '', item: '', price: '' });
    setShowAddForm(false);
  };

  const handleUpdate = () => {
    if (!editing?.id) return;
    if (!editing.date || !editing.platform || !editing.brand || !editing.category || !editing.item || !editing.price) {
      alert('Missing fields: Please fill in all fields');
      return;
    }
    
    const price = evaluatePrice(editing.price);
    if (price === null) {
      alert('Invalid price: use numbers and + - * / ( ), e.g. 20+15');
      return;
    }

    const platform = canonical('platforms', editing.platform);
    const brand = canonical('brands', editing.brand);
    const category = canonical('categories', editing.category);
    addNewSelection('platforms', platform);
    addNewSelection('brands', brand);
    addNewSelection('categories', category);

    const editingDateStr = formatLocalDate(editing.date);
    const updated = { ...editing, platform, brand, category, price, date: editingDateStr, month: editingDateStr.substring(0, 7) };

    // Update winnings and refresh the month modal to show the item under its updated month
    setWinnings(prev => {
      const next = prev.map(e => e.id === editing.id ? updated : e);
      // open the month modal for the updated month with refreshed items
      const itemsForMonth = next.filter(i => i.month === updated.month);
      setEditing({ month: updated.month, items: itemsForMonth });
      return next;
    });
  };

  const handleDelete = (id) => {
    setWinnings(prev => prev.filter(e => e.id !== id));
  };

  // Download all data as a JSON file the user can keep somewhere safe.
  const exportBackup = () => {
    const backup = {
      app: 'win-win',
      version: 1,
      exportedAt: new Date().toISOString(),
      winnings,
      selections
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `win-win-backup-${formatLocalDate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Merge a backup file into current data. Items with the same id are replaced by the
  // backup's version; everything else is kept, so importing never deletes anything.
  const importBackup = async (file) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const items = Array.isArray(data) ? data : data?.winnings;
      if (!Array.isArray(items)) throw new Error('No winnings found in file');

      const imported = normalizeWinnings(items.filter(i => i && i.id != null));
      const importedIds = new Set(imported.map(i => i.id));
      setWinnings(prev => [...prev.filter(e => !importedIds.has(e.id)), ...imported]);

      if (isValidSelections(data?.selections)) {
        setSelections(prev => ({
          platforms: [...new Set([...prev.platforms, ...data.selections.platforms])],
          brands: [...new Set([...prev.brands, ...data.selections.brands])],
          categories: [...new Set([...prev.categories, ...data.selections.categories])]
        }));
      }
      alert(`Imported ${imported.length} item${imported.length === 1 ? '' : 's'}.`);
    } catch (e) {
      alert(`Import failed: ${e.message}`);
    }
  };

  const availableYears = getAvailableYears(winnings);
  const winningsForYear = filterByYear(winnings, selectedYear);
  const monthlyData = groupByMonth(winningsForYear);

  const getAnalysisDateRange = () => {
    const today = new Date();
    const yearNum = Number(selectedYear) || currentYear;
    const isCurrentYear = yearNum === currentYear;
    let startDate, endDate, rangeLabel;

    // If custom date range is set, use it
    if (customDateStart && customDateEnd) {
      startDate = new Date(customDateStart);
      endDate = new Date(customDateEnd);
      const startMonth = getMonthLabel(customDateStart);
      const endMonth = getMonthLabel(customDateEnd);
      rangeLabel = `${startMonth} - ${endMonth}`;
      return { startDate, endDate, rangeLabel };
    }

    if (analysisRange === 'month') {
      if (isCurrentYear) {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        rangeLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      } else {
        startDate = new Date(yearNum, 0, 1);
        endDate = new Date(yearNum, 0, 31);
        rangeLabel = `${getMonthLabel(`${yearNum}-01`)} ${yearNum}`;
      }
    } else if (analysisRange === 'quarter') {
      if (isCurrentYear) {
        const quarter = Math.floor(today.getMonth() / 3);
        startDate = new Date(today.getFullYear(), quarter * 3, 1);
        endDate = new Date(today.getFullYear(), quarter * 3 + 3, 0);
      } else {
        startDate = new Date(yearNum, 0, 1);
        endDate = new Date(yearNum, 2, 31);
      }
      const startMonth = getMonthLabel(`${yearNum}-01`);
      const endMonth = getMonthLabel(`${yearNum}-03`);
      rangeLabel = `${startMonth} - ${endMonth} ${yearNum}`;
    } else if (analysisRange === 'half') {
      if (isCurrentYear) {
        const half = today.getMonth() < 6 ? 0 : 1;
        startDate = new Date(today.getFullYear(), half * 6, 1);
        endDate = new Date(today.getFullYear(), half * 6 + 6, 0);
      } else {
        startDate = new Date(yearNum, 0, 1);
        endDate = new Date(yearNum, 5, 30);
      }
      const startMonth = getMonthLabel(`${yearNum}-01`);
      const endMonth = getMonthLabel(`${yearNum}-06`);
      rangeLabel = `${startMonth} - ${endMonth} ${yearNum}`;
    } else {
      startDate = new Date(yearNum, 0, 1);
      endDate = new Date(yearNum, 11, 31);
      rangeLabel = String(yearNum);
    }

    return { startDate, endDate, rangeLabel };
  };

  const { startDate, endDate, rangeLabel } = getAnalysisDateRange();
  const filteredForAnalysis = filterByDateRange(winnings, startDate, endDate);

  const analysisData = (() => {
    const filtered = filteredForAnalysis;
    const below50 = filtered.filter(e => e.price < 50).length;
    const between50100 = filtered.filter(e => e.price >= 50 && e.price <= 100).length;
    const above100 = filtered.filter(e => e.price > 100).length;
    const total = filtered.length || 1;
    return {
      below50: ((below50 / total) * 100).toFixed(1),
      between50100: ((between50100 / total) * 100).toFixed(1),
      above100: ((above100 / total) * 100).toFixed(1),
      totalAmount: filtered.reduce((s, e) => s + Number(e.price), 0).toFixed(2),
      count: filtered.length
    };
  })();

  const displayedMonths = Object.keys(monthlyData).sort();

  const lastMonthInYear = displayedMonths.length > 0
    ? displayedMonths[displayedMonths.length - 1]
    : null;

  const addMonth = lastMonthInYear
    ? (() => {
        const [y, mo] = lastMonthInYear.split('-');
        const yearNum = Number(y) || Number(selectedYear) || currentYear;
        const monthNum = Number(mo) || 1;
        const nextMonth = Math.min(monthNum + 1, 12);
        return `${yearNum}-${String(nextMonth).padStart(2, '0')}`;
      })()
    : `${selectedYear}-01`;

  const addButtonMonthLabel = 'Next';
  const addButtonCenterLabel = 'Add another month';

  return (
    <div className="tracker-container">
      <div className="tracker-header">
        <h1 className="tracker-title">🎁 Win Win — Winnings Tracker</h1>
        <div className="header-controls">
          <div className="tab-row">
            <button
              className={`tab-button ${activeTab === 'main' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('main')}
            >
              Main
            </button>
            <button
              className={`tab-button ${activeTab === 'analysis' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('analysis')}
            >
              Analysis
            </button>
            <button
              className={`tab-button ${activeTab === 'settings' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      <div className="tracker-content">
        {activeTab === 'main' && (
          <div>
            <div className="stickers-header-row">
              <h2 className="stickers-title">Monthly Winnings - {selectedYear}</h2>
              <div className="year-selector-inline">
                <select
                  className="year-dropdown"
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(String(e.target.value));
                    setCustomDateStart('');
                    setCustomDateEnd('');
                  }}
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="month-sticker-grid">
              {displayedMonths.map((monthStr, index) => {
                const items = monthlyData[monthStr] || [];
                const total = items.reduce((s, i) => s + i.price, 0);
                const [y, mo] = (monthStr || '').split('-');
                const monthIndex = (Number(mo) ? Number(mo) - 1 : 0);
                const color = monthColors[monthIndex];
                const monthName = new Date(Number(y) || currentYear, monthIndex, 1).toLocaleDateString(undefined, { month: 'short' });
                const isCurrentMonth = monthStr === `${currentYear}-${String(currentMonth).padStart(2, '0')}` && String(selectedYear) === String(currentYear);

                if (items.length > 0) {
                  return (
                    <div key={monthStr} className="sticker-wrapper">
                      <button
                        className="month-sticker"
                        style={{ backgroundColor: color }}
                        onClick={() => setEditing({ month: monthStr, items })}
                      >
                        <div className="sticker-month">{monthName}</div>
                        <div className="sticker-amount">${Math.round(total)}</div>
                        <div className="sticker-count">{items.length}</div>
                      </button>
                      {/* small per-sticker add button removed in favor of appended add control */}
                    </div>
                  );
                }

                if (isCurrentMonth) {
                  return (
                    <div key={monthStr} className="sticker-wrapper">
                      <button
                        className="add-btn"
                        onClick={() => {
                          setEditing(null);
                          setShowAddForm(true);
                          setForm(f => ({ ...f, date: monthStr + '-01' }));
                        }}
                      >
                        <div className="sticker-month">{monthName}</div>
                        <div className="add-center">+ Add Winning</div>
                      </button>
                    </div>
                  );
                }

                return null;
              })}
              {/* Add button appended after latest sticker */}
              <div className="sticker-wrapper">
                <button
                  className="add-btn add-btn-dotted"
                  onClick={() => {
                    setEditing(null);
                    setShowAddForm(true);
                    setForm(f => ({ ...f, date: addMonth + '-01' }));
                  }}
                >
                  <div className="sticker-month">{addButtonMonthLabel}</div>
                  <div className="add-center">{addButtonCenterLabel}</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="analysis-section">
            <div className="analysis-controls">
              <label className="analysis-label">Period:</label>
              <div className="quick-select-buttons">
                <button
                  className={`quick-select ${analysisRange === 'month' ? 'active' : ''}`}
                  onClick={() => setAnalysisRange('month')}
                >
                  {String(selectedYear) === String(currentYear) ? 'Current Month' : 'First Month'}
                </button>
                <button
                  className={`quick-select ${analysisRange === 'quarter' ? 'active' : ''}`}
                  onClick={() => setAnalysisRange('quarter')}
                >
                  {String(selectedYear) === String(currentYear) ? 'Current Quarter' : 'First Quarter'}
                </button>
                <button
                  className={`quick-select ${analysisRange === 'half' ? 'active' : ''}`}
                  onClick={() => setAnalysisRange('half')}
                >
                  {String(selectedYear) === String(currentYear) ? 'Current Half' : 'First Half'}
                </button>
                <button
                  className={`quick-select ${analysisRange === 'year' ? 'active' : ''}`}
                  onClick={() => setAnalysisRange('year')}
                >
                  Full Year
                </button>
              </div>
            </div>

            <div className="analysis-controls">
              <label className="analysis-label">Custom Date Range:</label>
              <div className="date-range-inputs">
                <div className="date-input-group">
                  <label className="date-label">From:</label>
                  <input
                    type="date"
                    className="date-input"
                    value={customDateStart}
                    onChange={(e) => setCustomDateStart(e.target.value)}
                  />
                </div>
                <div className="date-input-group">
                  <label className="date-label">To:</label>
                  <input
                    type="date"
                    className="date-input"
                    value={customDateEnd}
                    onChange={(e) => setCustomDateEnd(e.target.value)}
                  />
                </div>
                {(customDateStart || customDateEnd) && (
                  <button
                    className="clear-date-btn"
                    onClick={() => {
                      setCustomDateStart('');
                      setCustomDateEnd('');
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="analysis-range-display">
              <span className="range-label">Showing: {rangeLabel}</span>
            </div>

            <div className="analysis-card">
              <div className="analysis-header">
                <span className="chart-icon">📊</span>
                <span className="analysis-label-text">Total Value</span>
              </div>
              <div className="analysis-total">${analysisData.totalAmount}</div>
              <div className="analysis-count">{analysisData.count} items</div>
            </div>

            <h3 className="analysis-title">Price Distribution</h3>

            <div className="dist-card">
              <div className="dist-row">
                <span className="dist-label">Below $50</span>
                <span className="dist-percent">{analysisData.below50}%</span>
              </div>
              <div className="progress-bg">
                <div
                  className="progress-fill"
                  style={{
                    width: `${analysisData.below50}%`,
                    backgroundColor: '#16a34a'
                  }}
                />
              </div>
            </div>

            <div className="dist-card">
              <div className="dist-row">
                <span className="dist-label">$50 - $100</span>
                <span className="dist-percent">{analysisData.between50100}%</span>
              </div>
              <div className="progress-bg">
                <div
                  className="progress-fill"
                  style={{
                    width: `${analysisData.between50100}%`,
                    backgroundColor: '#d97706'
                  }}
                />
              </div>
            </div>

            <div className="dist-card">
              <div className="dist-row">
                <span className="dist-label">Above $100</span>
                <span className="dist-percent">{analysisData.above100}%</span>
              </div>
              <div className="progress-bg">
                <div
                  className="progress-fill"
                  style={{
                    width: `${analysisData.above100}%`,
                    backgroundColor: '#dc2626'
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings-section">
            <div className="settings-group">
              <h3 className="settings-group-title">Backup</h3>
              <p className="settings-description backup-description">
                Your data is stored only on this device. Export a backup now and then, and import it to restore or move to another device.
              </p>
              <div className="form-actions">
                <button className="action-btn action-btn-primary" onClick={exportBackup}>
                  Export backup
                </button>
                <label className="action-btn action-btn-secondary backup-import-label">
                  Import backup
                  <input
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      importBackup(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <div className="storage-status">
                {storagePersistent === true && 'Storage: persistent ✓'}
                {storagePersistent === false && 'Storage: the browser may clear data if space runs low. Add to Home Screen and keep backups.'}
                {storagePersistent === null && 'Storage: persistence status unknown'}
              </div>
            </div>

            <h2 className="settings-title">Manage Selections</h2>
            <p className="settings-description">Add, edit, or delete platforms, brands, and categories used in your winnings.</p>

            <div className="settings-group">
              <h3 className="settings-group-title">Platforms</h3>
              <div className="settings-list">
                {selections.platforms.map((platform, index) => (
                  <div key={index} className="settings-item">
                    {editingSelection && editingSelection.type === 'platforms' && editingSelection.index === index ? (
                      <input
                        type="text"
                        className="settings-input"
                        value={editingSelection.value}
                        onChange={(e) => setEditingSelection({ ...editingSelection, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateSelection('platforms', index, editingSelection.value);
                            setEditingSelection(null);
                          } else if (e.key === 'Escape') {
                            setEditingSelection(null);
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <span className="settings-item-text">{platform}</span>
                    )}
                    <div className="settings-item-actions">
                      <button
                        className="settings-btn settings-btn-edit"
                        onClick={() => setEditingSelection({ type: 'platforms', index, value: platform })}
                      >
                        ✏️
                      </button>
                      <button
                        className="settings-btn settings-btn-delete"
                        onClick={() => deleteSelection('platforms', index)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                <div className="settings-add">
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="Add new platform"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        addSelection('platforms', e.target.value.trim());
                        e.target.value = '';
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Brands</h3>
              <div className="settings-list">
                {selections.brands.map((brand, index) => (
                  <div key={index} className="settings-item">
                    {editingSelection && editingSelection.type === 'brands' && editingSelection.index === index ? (
                      <input
                        type="text"
                        className="settings-input"
                        value={editingSelection.value}
                        onChange={(e) => setEditingSelection({ ...editingSelection, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateSelection('brands', index, editingSelection.value);
                            setEditingSelection(null);
                          } else if (e.key === 'Escape') {
                            setEditingSelection(null);
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <span className="settings-item-text">{brand}</span>
                    )}
                    <div className="settings-item-actions">
                      <button
                        className="settings-btn settings-btn-edit"
                        onClick={() => setEditingSelection({ type: 'brands', index, value: brand })}
                      >
                        ✏️
                      </button>
                      <button
                        className="settings-btn settings-btn-delete"
                        onClick={() => deleteSelection('brands', index)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                <div className="settings-add">
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="Add new brand"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        addSelection('brands', e.target.value.trim());
                        e.target.value = '';
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Categories</h3>
              <div className="settings-list">
                {selections.categories.map((category, index) => (
                  <div key={index} className="settings-item">
                    {editingSelection && editingSelection.type === 'categories' && editingSelection.index === index ? (
                      <input
                        type="text"
                        className="settings-input"
                        value={editingSelection.value}
                        onChange={(e) => setEditingSelection({ ...editingSelection, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateSelection('categories', index, editingSelection.value);
                            setEditingSelection(null);
                          } else if (e.key === 'Escape') {
                            setEditingSelection(null);
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <span className="settings-item-text">{category}</span>
                    )}
                    <div className="settings-item-actions">
                      <button
                        className="settings-btn settings-btn-edit"
                        onClick={() => setEditingSelection({ type: 'categories', index, value: category })}
                      >
                        ✏️
                      </button>
                      <button
                        className="settings-btn settings-btn-delete"
                        onClick={() => deleteSelection('categories', index)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                <div className="settings-add">
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="Add new category"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        addSelection('categories', e.target.value.trim());
                        e.target.value = '';
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {(showAddForm || (editing && editing.id)) && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">{editing?.id ? 'Edit Winning' : 'Add New Winning'}</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowAddForm(false);
                  setEditing(null);
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={editing?.date || form.date}
                  onChange={e => editing ? setEditing({ ...editing, date: e.target.value }) : setForm({ ...form, date: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Platform</label>
                <ComboInput
                  value={editing ? editing.platform : form.platform}
                  onChange={v => editing ? setEditing({ ...editing, platform: v }) : setForm({ ...form, platform: v })}
                  options={rankByUsage(selections.platforms, winnings, 'platform')}
                  limit={12}
                  placeholder="Select or type new platform"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Brand</label>
                <ComboInput
                  value={editing ? editing.brand : form.brand}
                  onChange={v => editing ? setEditing({ ...editing, brand: v }) : setForm({ ...form, brand: v })}
                  options={rankByUsage(selections.brands, winnings, 'brand')}
                  limit={6}
                  placeholder="Select or type new brand"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <ComboInput
                  value={editing ? editing.category : form.category}
                  onChange={v => editing ? setEditing({ ...editing, category: v }) : setForm({ ...form, category: v })}
                  options={rankByUsage(selections.categories, winnings, 'category')}
                  limit={8}
                  placeholder="Select or type new category"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Item Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={editing?.item || form.item}
                  onChange={e => editing ? setEditing({ ...editing, item: e.target.value }) : setForm({ ...form, item: e.target.value })}
                  placeholder="What did you win?"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Price</label>
                <input
                  type="text"
                  autoComplete="off"
                  className="form-input"
                  value={editing ? String(editing.price ?? '') : form.price}
                  onChange={e => {
                    const value = e.target.value;
                    editing
                      ? setEditing({ ...editing, price: value })
                      : setForm({ ...form, price: value });
                  }}
                  placeholder="0.00 or 20+15"
                />
                {(() => {
                  const raw = editing ? String(editing.price ?? '') : form.price;
                  if (raw.trim() === '') return null;
                  const value = evaluatePrice(raw);
                  return value === null
                    ? <div className="form-hint" style={{ color: '#dc2626' }}>Invalid expression</div>
                    : <div className="form-hint">Result: ${value.toFixed(2)}</div>;
                })()}
              </div>

              <div className="form-actions">
                <button 
                  className="action-btn action-btn-primary" 
                  onClick={editing?.id ? handleUpdate : handleSubmit}
                >
                  {editing?.id ? 'Update' : 'Add'}
                </button>
                <button
                  className="action-btn action-btn-secondary"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditing(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing?.items && Array.isArray(editing.items) && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">{new Date(editing.month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
              <button
                className="modal-close"
                onClick={() => setEditing(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="items-list">
                {editing.items.map(item => (
                  <div key={String(item.id)} className="item-row">
                    <div className="item-info">
                      <div className="item-title">{item.item}</div>
                      <div className="item-meta">{item.category} • {item.brand} • {item.platform}</div>
                    </div>
                    <div className="item-actions">
                      <span className="item-price">${Number(item.price).toFixed(2)}</span>
                      <button
                        className="icon-button"
                        onClick={() => setEditing(item)}
                      >
                        ✏️
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => {
                          handleDelete(item.id);
                          setEditing({ month: editing.month, items: editing.items.filter(i => i.id !== item.id) });
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="action-btn action-btn-primary"
                onClick={() => {
                  setEditing(null);
                  setShowAddForm(true);
                  setForm({ date: editing.month + '-01', platform: '', brand: '', category: '', item: '', price: '' });
                }}
                style={{ width: '100%', marginBottom: '8px' }}
              >
                + Add Winning
              </button>

              <button
                className="action-btn action-btn-secondary"
                onClick={() => setEditing(null)}
                style={{ width: '100%', marginTop: '12px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
