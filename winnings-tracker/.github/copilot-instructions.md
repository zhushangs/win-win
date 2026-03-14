# AI Coding Agent Instructions for Winnings Tracker

## Project Overview
**Winnings Tracker** is a React web app (Create React App) for tracking e-commerce winnings (gifts, prizes, discounts) across platforms. The app uses a tab-based UI with two main views: monthly aggregation view and price distribution analysis.

### Architecture Pattern
- **Framework**: React 19 + React DOM (web)
- **Build Tool**: Create React App (CRA) with react-scripts
- **Data Flow**: Component state → localStorage persistence via custom storage wrapper
- **Styling**: CSS modules / plain CSS in `src/components/WinningTracker.css`
- **Key Abstraction**: Monthly grouping (`groupByMonth()`) is central to data organization

## Critical Files & Their Roles

| File | Purpose | Key Patterns |
|------|---------|--------------|
| `src/components/WinningTracker.js` | Main component (~370 lines) | Tab routing, modal forms, data CRUD, price evaluation |
| `src/components/WinningTracker.css` | Component styling (430 lines) | Flexbox layout, modal overlays, responsive design |
| `src/lib/storage.js` | localStorage wrapper | Always wrapped in try-catch; returns `[]` on failure |
| `src/App.js` | App root | Simple wrapper rendering WinningTracker |
| `src/index.js` | React DOM entry | Standard CRA setup with ReactDOM.createRoot |

## Data Model

```javascript
const winningItem = {
  id: number,           // Unix timestamp (Date.now())
  date: string,         // 'YYYY-MM-DD' format (user input)
  platform: string,     // e.g., "Amazon", "Steam"
  brand: string,        // e.g., "Sony", "Valve"
  category: string,     // e.g., "Electronics", "Gaming"
  item: string,         // Product name
  price: number,        // Evaluated numeric value
  month: string         // Derived 'YYYY-MM' for grouping
};
```

**Storage**: All items stored in `AsyncStorage` under key `'WINWIN_WINNINGS'` as JSON array.

## Key Workflows

### Adding/Editing Winnings
1. Modal forms (`Modal` component) manage add/edit state separately (`showAddForm`, `editing`)
2. **Price Field Accepts Expressions**: `"20+15"` is evaluated to `35` via `expr-eval` library (see `safeEvaluate()`)
3. **Validation**: All 6 fields required (date, platform, brand, category, item, price) before submission
4. **Month Derivation**: `month` is derived from date as `date.substring(0, 7)` on every save

### Data Persistence
- **On Mount**: `useEffect` loads stored data from `localStorage` or initializes with `defaultSampleWinnings` examples
- **On Change**: Second `useEffect` auto-saves winnings to `localStorage` on state change (triggered by CRUD operations)
- **Error Handling**: Storage failures log warnings but don't crash; empty array fallback prevents UI breaks
- **Key**: Data persists across browser sessions via `localStorage.getItem/setItem`

### UI Tab System
- **Main Tab**: Shows month cards (color-coded by month index) → click to expand month detail view
- **Analysis Tab**: Shows total value + price distribution (% in 3 ranges) with progress bars
- **Add Button**: Appears as outline card in Main view + inline button in month detail

## Important Conventions

### Styling & Layout
- **CSS Framework**: Plain CSS with flexbox for layout (no CSS-in-JS libraries)
- **Primary Color**: `#7c3aed` (purple) — buttons, totals, headings
- **Month Colors**: Array of 12 hardcoded hex values (one per month index) for color-coded cards
- **Utility Colors**: Success (`#16a34a`), warning (`#d97706`), error (`#dc2626`)
- **Text Colors**: Neutral grays (`#334155`, `#475569`)
- **Responsive**: Uses CSS Grid for month cards; adapts to mobile with `@media (max-width: 768px)`
- **Modal Pattern**: Conditional rendering with overlay (`.modal-overlay { position: fixed }`)
- **Icons**: Unicode emoji for UI elements (✏️ edit, 🗑️ delete, 📊 chart, + add)

### Component Structure
- **No Redux/Context**: All state in `WinningTracker` root component
- **Modal Forms**: Use separate state variables (`showAddForm`, `editing`) — not combined object
- **Form Reset**: Always explicitly reset to empty object on modal close
- **Derivation**: `monthlyData` and `analysisData` recalculated on every render from winnings array
- **Browser APIs**: Uses native `alert()` for validation errors (not a dialog library)

## Common Tasks

### To Add a New Winning Field
1. Add to `defaultSampleWinnings` data structure
2. Add to form initial state: `setForm({ ..., newField: '' })`
3. Add `TextInput` in both Add and Edit modals
4. Add validation in `handleSubmit()` and `handleUpdate()`
5. Include in the `newWin` object before `setWinnings()`

### To Modify Analysis Metrics
- Edit the `analysisData` computed object (lines ~127-135)
- Recalculate totals/percentages using `filtered` array
- Add new progress bar UI in Analysis tab (copy existing `distCard` pattern)

### To Change Month Colors
- Modify `monthColors` array (12 elements, one per month)
- Apply via: `backgroundColor: monthColors[monthIndex]` in month card

### Running Tests & Dev
```bash
npm start           # Dev server on http://localhost:3000
npm test            # Jest test runner in watch mode
npm run build       # Production build to /build folder
npm run eject       # Eject CRA (irreversible - avoid unless necessary)
```

**Note**: Dev server uses webpack with hot module reloading. Changes auto-refresh in browser.

## Dependencies to Know
- **react**, **react-dom**: Core web framework (v19)
- **react-scripts**: CRA tooling (Webpack, Babel, Jest) — not ejected
- **expr-eval**: Mathematical expression parser for price field (`"20+15"` → 35)
- **Testing Libraries**: @testing-library/react, @testing-library/jest-dom, @testing-library/user-event
- **web-vitals**: Performance monitoring (metrics reporting)

## File Structure
```
src/
  ├── App.js                    # Root component
  ├── App.css                   # Root styles
  ├── index.js                  # ReactDOM.createRoot entry
  ├── components/
  │   ├── WinningTracker.js     # Main component (all logic + JSX)
  │   └── WinningTracker.css    # Component styles (430 lines)
  └── lib/
      └── storage.js            # localStorage abstraction (load/save utilities)
public/
  └── index.html                # HTML entry point
.github/
  └── copilot-instructions.md   # This file
```

## Testing Notes
- Existing test (`src/App.test.js`) is placeholder and outdated (references "learn react" text not in app)
- No component tests currently; storage layer could benefit from mocking `localStorage`
- Manual testing recommended for UI flows (buttons, forms, month navigation)
- **CRA Test Runner**: Uses Jest with React Testing Library — run with `npm test`

## Browser Compatibility & Deployment
- **Target**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **Build Output**: `/build` folder ready for static hosting (nginx, Vercel, Netlify, etc.)
- **localStorage Limit**: ~5-10MB depending on browser (enough for hundreds of winnings)
- **PWA Ready**: Includes `manifest.json` for PWA support (can add to home screen)

## Gotchas & Tips
1. **Month Index**: Derived from date's month (0-indexed), not a separate field — ensure dates are valid
2. **Price as String**: Form stores price as string; always call `safeEvaluate()` before saving numeric value
3. **Modal State Conflicts**: Ensure `showAddForm` and `editing` are both false to avoid UI confusion
4. **localStorage → JSON**: Data stored as JSON string; roundtrip conversion happens in storage.js
5. **CSS in src/components/**: All styling in CSS file, not inline styles (except dynamic width in progress bars)
6. **Hot Module Reloading**: Dev server may not reload if you edit CSS — refresh browser if needed
7. **CRA Limitations**: No build optimization config without ejecting; good enough for small projects

## Recent Migration (v0.1.0 → Web)
This app was **converted from React Native to web React** in v0.1.0:
- Replaced `View`, `Text`, `TouchableOpacity` with semantic HTML elements
- Replaced `AsyncStorage` with `localStorage` 
- Replaced StyleSheet with plain CSS
- Replaced Expo icons with unicode emoji
- File structure moved from `components/`, `lib/` to `src/components/`, `src/lib/` (CRA requirement)
- Kept all business logic unchanged (data model, calculations, state management)
