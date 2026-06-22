# MarkMind PDF

MarkMind PDF is a React/Vite markdown editor and live PDF-style preview tool. It supports markdown, tables, Mermaid diagrams, themed code blocks, document styling, and PDF export from the browser.

## Prerequisites

Install these before running the app locally:

- Node.js 20 or newer
- npm, included with Node.js
- Optional: Docker Desktop, only if you want to run the app in Docker

On Windows PowerShell, use `npm.cmd` if `npm` is blocked by the execution policy.

## Project Structure

```text
src/
  components/   React preview and diagram components
  services/     Gemini and PDF helpers
  App.tsx       Main application shell
  index.tsx     React entry point
  types.ts      Shared theme types
docker/
  nginx.conf    Production nginx config used by Docker
Dockerfile      Production container build
docker-compose.yml
```

## Environment Setup

The app can run without an API key, but the AI styling feature requires a Gemini API key.

Create a `.env.local` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Do not commit `.env.local`.

## Run Locally Without Docker

Install dependencies:

```powershell
npm install
```

Start the dev server:

```powershell
npm.cmd run dev
```

Open the local URL printed by Vite. This project is configured to use:

```text
http://localhost:3000
```

## Build Locally

Create a production build:

```powershell
npm.cmd run build
```

Preview the production build locally:

```powershell
npm.cmd run preview
```

## AI Diagram Blocks

MarkMind supports AI-friendly JSON diagram blocks in Markdown. Use a fenced `diagram` block:

````markdown
```diagram
{
  "type": "flowchart",
  "title": "Authentication",
  "nodes": [
    { "id": "start", "label": "Start", "kind": "start" },
    { "id": "login", "label": "Login", "kind": "process" },
    { "id": "dashboard", "label": "Dashboard", "kind": "end" }
  ],
  "edges": [
    { "source": "start", "target": "login" },
    { "source": "login", "target": "dashboard" }
  ]
}
```
````

Supported diagram types:

```text
flowchart
network
architecture
database
uml
mindmap
```

Supported node kinds:

```text
start
end
process
decision
database
server
client
actor
component
chip
pin
memory
storage
cloud
```

AI generation rules:

- Generate only JSON inside `diagram` fences.
- Do not generate SVG, JSX, React Flow, Mermaid, or coordinates.
- Do not include `x` or `y` values; layout is automatic.
- Always use unique node IDs.
- Keep labels short; put long explanations in normal Markdown text.
- Edges must reference existing node IDs.

## Run With Docker

Docker is optional. The normal Node/Vite workflow still works.

Install Docker Desktop for Windows:

```powershell
winget install Docker.DockerDesktop
```

After installing, open Docker Desktop once and verify:

```powershell
docker --version
docker compose version
docker run hello-world
```

Build and run the app:

```powershell
docker compose up --build
```

Open:

```text
http://localhost:3000
```

To stop Docker:

```powershell
docker compose down
```

## Docker With Gemini API Key

The Gemini key is embedded during the Vite build. If you want AI styling to work inside Docker, set `GEMINI_API_KEY` before building.

PowerShell:

```powershell
$env:GEMINI_API_KEY="your_gemini_api_key_here"
docker compose up --build
```

## Useful Commands

```powershell
npm install
npm.cmd run dev
npm.cmd run build
npm.cmd run preview
docker compose up --build
docker compose down
```

## Troubleshooting

If PowerShell blocks `npm`, use:

```powershell
npm.cmd run dev
```

If port `3000` is already in use, stop the other process or change the port in `vite.config.ts` and `docker-compose.yml`.

If Docker commands fail, make sure Docker Desktop is running.

If AI Style does not work, confirm `GEMINI_API_KEY` is set before starting or building the app.

## License

This project is licensed under the MIT License. You can use it for personal and commercial projects, but copies or substantial portions of the project must include the original copyright and license notice.
