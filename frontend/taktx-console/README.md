# TaktX Console - Frontend
A Next.js-based web console for monitoring and managing TaktX BPMN process engine.
## Tech Stack
- **Next.js 16** (App Router)
- **TypeScript**
- **Ant Design 5** (Dark Theme)
- **bpmn-js** (BPMN Diagram Viewer)
## Getting Started
### Prerequisites
- Node.js 18+ and npm
- TaktX backend running on `http://localhost:8084`
### Installation
```bash
npm install
```
### Development
```bash
npm run dev
```
Open [http://localhost:3001](http://localhost:3001) in your browser.
### Build
```bash
npm run build
npm run start
```
## Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Configure backend URL if different from default:
```env
NEXT_PUBLIC_TAKTX_BACKEND_URL=http://localhost:8084
NEXT_PUBLIC_TAKTX_WS_URL=ws://localhost:8084/ws
```
## Project Structure
```
app/                    # Next.js App Router pages
├── runway/            # Process monitoring and control
└── page.tsx           # Community overview landing page
components/
├── layout/            # Shell layout, navigation
└── runway/            # Runway-specific components
lib/
├── api/               # API client functions
├── hooks/             # React hooks
└── config/            # Configuration
```
## Features
### Runway - Process Monitoring
- **Process Definition Viewer**
  - Select process definitions from dropdown
  - Choose specific version
  - View BPMN diagram with auto-zoom
### Coming Soon
- Additional runway UX improvements
## API Integration
The frontend connects to the TaktX backend REST API:
- `GET /processdefinitions` - List all process definition IDs
- `GET /processdefinitions?id={id}` - Get versions for a definition
- `GET /processdefinitions/{id}/version/{version}/xml` - Get BPMN XML
## Development Notes
- Dark theme is enabled by default via Ant Design's `darkAlgorithm`
- BPMN diagrams are rendered client-side using `bpmn-js`
- All API calls use `fetch` with type-safe TypeScript interfaces
## License
Apache License 2.0
