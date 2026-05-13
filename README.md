# Formun

Standalone choreography formation planner inspired by ArrangeUs.

## Features

- Local-first choreography projects.
- 2D stage editor with grid, snap, dancer drag/drop, props, and movement paths.
- Formation timeline with comments and timestamps.
- JSON import/export.
- PDF export with one page per formation.

## Run

If npm is available:

```bash
npm install
npm run dev
npm run build
```

Temporary verification from the old CRM workspace without npm in PATH:

```powershell
$env:NODE_PATH='C:\Users\ACER\crm-sdvico-40\node_modules'
..\crm-sdvico-40\node_modules\.bin\tsc.cmd --noEmit --typeRoots C:\Users\ACER\crm-sdvico-40\node_modules\@types
..\crm-sdvico-40\node_modules\.bin\vite.cmd --host :: --port 5174
```

Local URL:

```text
http://localhost:5174
```
