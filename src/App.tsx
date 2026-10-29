import React, { useState, useEffect, useRef } from 'react';
import { generatePdf } from './services/pdfService';
import { exportDocx } from './docxExport';
import MarkdownPreview from './components/MarkdownPreview';
import { AppTheme, DEFAULT_THEME, THEME_PRESETS } from './types';
import { getChatGptDiagramPaste } from './diagrams/chatgptClipboard';
import {
  DocumentTextIcon,
  DocumentArrowDownIcon,
  PrinterIcon,
  TrashIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  EyeIcon,
  AdjustmentsHorizontalIcon,
  MinusIcon,
  HashtagIcon,
  ArrowsPointingOutIcon,
  SwatchIcon,
  CodeBracketIcon,
  WindowIcon,
  SunIcon,
  MoonIcon,
  Square2StackIcon,
  PaintBrushIcon,
  ArrowsPointingInIcon,
  Bars3BottomLeftIcon,
  TagIcon,
  ChevronDownIcon,
  CommandLineIcon
} from '@heroicons/react/24/outline';

const INITIAL_MARKDOWN = `# Project Documentation

Welcome to **MarkMind** - your premium markdown to PDF export tool.

## Features Overview

MarkMind supports a wide range of markdown features:

1. **Rich Text Formatting**
   - Bold, italic, and strikethrough text
   - Inline \`code\` snippets
   - Block quotes and horizontal rules

2. **Code Blocks with Syntax Highlighting**
   - Multiple language support
   - Line numbers
   - Window-style headers

3. **AI-Friendly Diagram Blocks**
   - JSON-based diagram definitions
   - Automatic layout
   - SVG rendering for sharp PDF output

4. **Tables & Lists**
   - Tables with alignment
   - Nested lists at any depth
   - Ordered and unordered lists

---

## Code Example

Here's a simple React component:

\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
}

function UserCard({ user }: { user: User }) {
  return (
    <div className="card">
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
}
\`\`\`

---

## System Architecture

\`\`\`diagram
{
  "type": "architecture",
  "title": "Markdown to PDF Pipeline",
  "nodes": [
    {
      "id": "markdown",
      "label": "Markdown",
      "kind": "client"
    },
    {
      "id": "parser",
      "label": "Parser",
      "kind": "process"
    },
    {
      "id": "renderer",
      "label": "Renderer",
      "kind": "component"
    },
    {
      "id": "pdf",
      "label": "PDF",
      "kind": "storage"
    }
  ],
  "edges": [
    {
      "source": "markdown",
      "target": "parser"
    },
    {
      "source": "parser",
      "target": "renderer"
    },
    {
      "source": "renderer",
      "target": "pdf"
    }
  ]
}
\`\`\`

Mermaid diagrams are still supported:

\`\`\`mermaid
graph LR
    A[Markdown Input] --> B[Parser]
    B --> C[Renderer]
    C --> D[Theme Engine]
    D --> E[PDF Output]
    
    style A fill:#6366f1,color:#fff
    style E fill:#22c55e,color:#fff
\`\`\`

---

## Feature Status

| Feature | Status | Notes |
| :--- | :---: | :--- |
| **Markdown Parsing** | ✅ Complete | Full GFM support |
| **Mermaid Diagrams** | ✅ Complete | Flowcharts, sequences |
| **Theme Customization** | ✅ Complete | AI-powered themes |
| **PDF Export** | ✅ Complete | A4 format |

---

## Getting Started

> Simply paste your markdown in the editor and watch it transform into a beautifully styled document!

Try changing the theme, adjusting fonts, or click **AI Style** for automatic styling.
`;

type ViewMode = 'editor' | 'preview';
type PaddingSize = 'small' | 'medium' | 'large';

function generateMaterialTheme(baseColor: string): AppTheme {
  return {
    name: 'Material Expressive',
    isDark: false,
    colors: {
      primary: baseColor,
      secondary: '#4b5563', // Neutral gray
      background: '#ffffff',
      text: '#1f2937',
      codeBackground: `${baseColor}15`, // Very light opacity of primary
      heading: baseColor,
      border: `${baseColor}40`
    },
    fonts: {
      heading: 'Playfair Display, serif',
      body: 'Lato, sans-serif',
      code: 'JetBrains Mono, monospace',
    }
  };
}

function App() {
  const [markdown, setMarkdown] = useState<string>(INITIAL_MARKDOWN);
  const [theme, setTheme] = useState<AppTheme>(DEFAULT_THEME);
  const [ignoreHr, setIgnoreHr] = useState<boolean>(true);
  const [wordWrap, setWordWrap] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<number>(14);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Print Options
  const [paddingSize, setPaddingSize] = useState<PaddingSize>('medium');
  const [headerText, setHeaderText] = useState<string>('');
  const [showPageNumbers, setShowPageNumbers] = useState<boolean>(false);

  // Code Block Options
  const [codeFont, setCodeFont] = useState<string>('JetBrains Mono, monospace');
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(true);
  const [codeWindowStyle, setCodeWindowStyle] = useState<boolean>(true);
  const [codeBlockBorder, setCodeBlockBorder] = useState<boolean>(false);
  const [codeBlockDark, setCodeBlockDark] = useState<boolean>(false); // Default White
  const [highlightStyle, setHighlightStyle] = useState<string>('oneLight'); // Default to One Light

  // Custom Color State
  const [customColor, setCustomColor] = useState<string>('#6750A4');

  const [viewMode, setViewMode] = useState<ViewMode>('editor');

  // DOCX export progress (null = idle)
  const [docxProgress, setDocxProgress] = useState<{ pct: number; label: string } | null>(null);

  // Sidebar toggles for Desktop & Mobile settings drawer
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);
  // Accordion for rarely-used code & AI settings
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Stats calculation
  const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length;
  const charCount = markdown.length;
  const lineCount = markdown.split('\n').length;

  // Effect to update theme when color changes IF we are in Material Expressive mode
  useEffect(() => {
    if (theme.name === 'Material Expressive') {
      setTheme(generateMaterialTheme(customColor));
    }
  }, [customColor]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportDoc = async () => {
    setDocxProgress({ pct: 0, label: 'Starting…' });
    try {
      await exportDocx(theme, (pct, label) => setDocxProgress({ pct, label }));
      setTimeout(() => setDocxProgress(null), 800);
    } catch (e) {
      setDocxProgress(null);
      console.error(e);
      alert('DOCX export failed. See console for details.');
    }
  };

  const handleReset = () => {
    if (confirm("Reset current progress?")) {
      setMarkdown(INITIAL_MARKDOWN);
      setTheme(DEFAULT_THEME);
    }
  };

  // ---- DocIT 5x4 settings grid ----
  // Rule: max 5 rows; each row carries at most 4 columns. Rarely-used options
  // live in the accordion, which itself obeys the same 5x4 limit.
  const gridSelect =
    'w-full bg-docit-surface text-docit-text text-xs font-semibold rounded-xl border border-docit-border py-2 px-2.5 ' +
    'focus:outline-none focus:border-docit-accent-glow transition-all cursor-pointer appearance-none truncate';

  const TileButton = ({ active, onClick, icon, tip }: { active: boolean; onClick: () => void; icon: React.ReactNode; tip: string }) => (
    <button
      onClick={onClick}
      title={tip}
      className={`flex items-center justify-center h-10 rounded-xl border transition-all active:scale-95 ${
        active
          ? 'bg-docit-accent-subtle border-docit-accent text-docit-text shadow-[0_0_10px_rgba(106,44,107,0.35)]'
          : 'bg-docit-surface border-docit-border text-docit-text-muted hover:text-docit-text hover:border-docit-border-light'
      }`}
    >
      {icon}
    </button>
  );

  const renderSettingsControls = () => (
    <div className="space-y-2 text-docit-text">
      {/* Row 1: theme preset (3 or 4 cols) + accent color (1 col, Material Expressive only) */}
      <div className="grid grid-cols-4 gap-2">
        <div className={`${theme.name === 'Material Expressive' ? 'col-span-3' : 'col-span-4'} relative`} title="Document theme">
          <SwatchIcon className="w-3.5 h-3.5 text-docit-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={theme.name}
            onChange={(e) => {
              const selected = THEME_PRESETS.find(t => t.name === e.target.value);
              if (selected) setTheme(selected);
            }}
            className={gridSelect + ' pl-7'}
          >
            {THEME_PRESETS.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
        {theme.name === 'Material Expressive' && (
          <div className="col-span-1 relative" title="Accent color">
            <input
              type="color"
              value={customColor}
              onChange={(e) => { setCustomColor(e.target.value); }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div
              className="w-full h-10 rounded-xl border border-docit-border pointer-events-none"
              style={{ backgroundColor: customColor }}
            />
          </div>
        )}
      </div>

      {/* Row 2: font size slider (2 cols) + page margins (2 cols) */}
      <div className="grid grid-cols-4 gap-2">
        <div className="col-span-2 bg-docit-surface border border-docit-border rounded-xl px-2.5 flex items-center gap-2 h-10" title="Base font size">
          <span className="text-[10px] font-black text-docit-text-muted">A</span>
          <input
            type="range" min="10" max="24" step="1"
            value={fontSize}
            onChange={e => setFontSize(parseInt(e.target.value))}
            className="flex-1 min-w-0 accent-docit-accent-glow h-1 bg-docit-border rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-[10px] font-mono text-docit-text-muted">{fontSize}px</span>
        </div>
        <div className="col-span-2 relative" title="Page margins">
          <ArrowsPointingInIcon className="w-3.5 h-3.5 text-docit-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={paddingSize}
            onChange={(e) => setPaddingSize(e.target.value as PaddingSize)}
            className={gridSelect + ' pl-7 h-10'}
          >
            <option value="small">S · 12.7mm</option>
            <option value="medium">M · 25.4mm</option>
            <option value="large">L · 35mm</option>
          </select>
        </div>
      </div>

      {/* Row 3: four icon toggles */}
      <div className="grid grid-cols-4 gap-2">
        <TileButton active={showPageNumbers} onClick={() => setShowPageNumbers(!showPageNumbers)} tip="Show page numbers" icon={<HashtagIcon className="w-4 h-4" />} />
        <TileButton active={!ignoreHr} onClick={() => setIgnoreHr(!ignoreHr)} tip="Horizontal rules" icon={<MinusIcon className="w-4 h-4" />} />
        <TileButton active={wordWrap} onClick={() => setWordWrap(!wordWrap)} tip="Word wrap in editor" icon={<Bars3BottomLeftIcon className="w-4 h-4" />} />
        <TileButton active={false} onClick={handleReset} tip="Reset document" icon={<TrashIcon className="w-4 h-4" />} />
      </div>

      {/* Row 4: running header input (4 cols) */}
      <div className="relative" title="Running header text">
        <TagIcon className="w-3.5 h-3.5 text-docit-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={headerText}
          onChange={(e) => setHeaderText(e.target.value)}
          placeholder="Running header (e.g. Confidential)"
          className="w-full bg-docit-surface text-docit-text text-xs font-semibold rounded-xl border border-docit-border py-2.5 pl-7 pr-2.5 focus:outline-none focus:border-docit-accent-glow transition-all placeholder:text-docit-text-tertiary"
        />
      </div>

      {/* Row 5: accordion for rare options */}
      <button
        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-docit-surface border border-docit-border text-docit-text-muted hover:text-docit-text hover:border-docit-border-light transition-all"
        title="Code & AI settings"
      >
        <span className="flex items-center gap-2 text-xs font-bold">
          <CodeBracketIcon className="w-4 h-4" /> Code & AI settings
        </span>
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
      </button>

      {isAdvancedOpen && (
        <div className="space-y-2 pt-1">
          {/* Acc-Row 1: code font (2) + syntax theme (2) */}
          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-2 relative" title="Code font">
              <CommandLineIcon className="w-3.5 h-3.5 text-docit-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select value={codeFont} onChange={(e) => setCodeFont(e.target.value)} className={gridSelect + ' pl-7 h-10'}>
                <option value="JetBrains Mono, monospace">JetBrains Mono</option>
                <option value="Space Mono, monospace">Space Mono</option>
                <option value="Fira Code, monospace">Fira Code</option>
                <option value="DM Mono, monospace">DM Mono</option>
              </select>
            </div>
            <div className="col-span-2 relative" title="Syntax highlight theme">
              <PaintBrushIcon className="w-3.5 h-3.5 text-docit-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select value={highlightStyle} onChange={(e) => setHighlightStyle(e.target.value)} className={gridSelect + ' pl-7 h-10'}>
                <option value="default">System default</option>
                <option value="dracula">Dracula</option>
                <option value="atomDark">Atom Dark</option>
                <option value="vscDarkPlus">VS Code Dark</option>
                <option value="oneDark">One Dark</option>
                <option value="github">GitHub Light</option>
                <option value="vs">VS Light</option>
              </select>
            </div>
          </div>

          {/* Acc-Row 2: four code-box toggles */}
          <div className="grid grid-cols-4 gap-2">
            <TileButton active={codeWindowStyle} onClick={() => setCodeWindowStyle(!codeWindowStyle)} tip="IDE window header on code blocks" icon={<WindowIcon className="w-4 h-4" />} />
            <TileButton active={showLineNumbers} onClick={() => setShowLineNumbers(!showLineNumbers)} tip="Code line numbers" icon={<HashtagIcon className="w-4 h-4" />} />
            <TileButton active={codeBlockDark} onClick={() => setCodeBlockDark(!codeBlockDark)} tip="Dark code container" icon={codeBlockDark ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />} />
            <TileButton active={codeBlockBorder} onClick={() => setCodeBlockBorder(!codeBlockBorder)} tip="Code container border" icon={<Square2StackIcon className="w-4 h-4" />} />
          </div>

        </div>
      )}
    </div>
  );

  return (
    <>
      {/* DOCX export progress overlay */}
      {docxProgress && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm print:hidden">
          <div className="w-80 max-w-[90vw] bg-docit-bg-deep border border-docit-border rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-2">
              <DocumentTextIcon className="w-5 h-5 text-docit-accent-glow" />
              <span className="text-sm font-bold text-docit-text">Building DOCX</span>
            </div>
            <div className="h-2 w-full bg-docit-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-docit-accent transition-all duration-200 ease-out"
                style={{ width: `${docxProgress.pct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-docit-text-muted">
              <span>{docxProgress.label}</span>
              <span className="font-mono">{docxProgress.pct}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic print styles based on current theme */}
      <style>{`
        @media print {
          @page {
            margin: 0;
            size: A4;
          }
          html, body {
            background-color: ${theme.colors.background} !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        
        /* Radial Dot Grid for Railway Theme Canvas */
        .railway-canvas {
          background-color: #09090b;
          background-image: radial-gradient(rgba(139, 92, 246, 0.07) 1.5px, transparent 1.5px);
          background-size: 24px 24px;
        }

        /* Pulsing Status Dot */
        .pulse-green {
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          animation: pulse-green-anim 2s infinite;
        }

        @keyframes pulse-green-anim {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          }
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
          }
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }

        /* Custom Switch Checked Colors */
        .sr-only:checked + .switch-label {
          background-color: #8b5cf6 !important;
          border-color: #7c3aed !important;
        }
      `}</style>

      {/* Main Container styled with Railway Dark Mode */}
      <div className="h-screen overflow-hidden bg-docit-bg-deep text-docit-text font-sans flex flex-col print:h-auto print:min-h-screen print:overflow-visible print:bg-transparent selection:bg-docit-accent/30 selection:text-docit-text">
        
        {/* DocIT compact header */}
        <header className="h-14 shrink-0 flex items-center justify-between px-3 md:px-5 bg-docit-bg border-b border-docit-border print:hidden z-50">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden md:flex p-1.5 rounded-full text-docit-text-muted hover:text-docit-text hover:bg-docit-elevated border border-docit-border hover:border-docit-border-light transition-all active:scale-95"
              title="Toggle settings sidebar"
            >
              <AdjustmentsHorizontalIcon className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-tr from-docit-accent-active to-docit-accent-glow shadow-[0_4px_14px_rgba(106,44,107,0.45)]">
                <DocumentTextIcon className="w-5 h-5 text-docit-text" />
              </div>
              <span className="text-base font-extrabold tracking-tight text-docit-text leading-none">DocIT</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" title="Renderer ready" />
          </div>

          {/* Actions — icon-only, tooltips carry the labels */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrint}
              className="p-2.5 rounded-full bg-docit-surface border border-docit-border text-docit-text-muted hover:text-docit-text hover:bg-docit-elevated hover:border-docit-border-light active:scale-95 transition-all select-none"
              title="Export as PDF (print)"
            >
              <PrinterIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handleExportDoc}
              disabled={!!docxProgress}
              className="p-2.5 rounded-full bg-docit-surface border border-docit-border text-docit-text-muted hover:text-docit-text hover:bg-docit-elevated hover:border-docit-border-light active:scale-95 transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed"
              title={docxProgress ? 'Exporting DOCX…' : 'Export as Word (.docx)'}
            >
              {docxProgress
                ? <ArrowPathIcon className="w-5 h-5 animate-spin" />
                : <DocumentArrowDownIcon className="w-5 h-5" />}
            </button>
            <button
              onClick={handleReset}
              className="p-2.5 rounded-full bg-docit-surface border border-docit-border text-docit-text-tertiary hover:text-red-400 hover:border-red-900/60 hover:bg-red-500/10 transition-all active:scale-95"
              title="Reset document to default"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main responsive dashboard layout */}
        <div className="flex-1 min-h-0 flex overflow-hidden relative print:block">
          
          {/* Left Config Sidebar (Desktop) */}
          <aside
            className={`
              shrink-0 self-stretch h-full border-r border-docit-border bg-docit-bg flex-col overflow-y-auto custom-scrollbar
              hidden md:flex transition-all duration-300
              ${isSidebarOpen ? 'w-80 p-6 space-y-6 opacity-100' : 'w-0 p-0 opacity-0 overflow-hidden border-none'}
              print:hidden
            `}
          >
            <div className="flex justify-between items-center pb-2">
              <span className="text-[10px] font-black tracking-widest text-docit-text-tertiary uppercase">Configuration</span>
              <span className="text-[8px] font-bold text-docit-text-tertiary bg-docit-surface/80 px-1.5 py-0.5 rounded border border-docit-border">Local</span>
            </div>
            {renderSettingsControls()}
          </aside>

          {/* Workspace Canvas (Radial Grid Background) */}
          <main className="flex-1 min-w-0 min-h-0 flex flex-col md:flex-row p-0 md:p-5 gap-5 railway-canvas overflow-hidden print:p-0 print:block">
            
            {/* Editor Pane (Write Mode) */}
            <div
              className={`
                flex-1 min-w-0 min-h-0 flex-col transition-all duration-300
                ${viewMode === 'editor' ? 'flex' : 'hidden md:flex md:w-1/2'}
                print:hidden
              `}
            >
              <div className="flex-1 min-h-0 flex flex-col bg-docit-bg-deep md:rounded-2xl border border-docit-border shadow-2xl overflow-hidden focus-within:ring-2 focus-within:ring-docit-accent/40 focus-within:border-docit-accent-glow transition-all">
                {/* Editor File Tab Header */}
                <div className="h-11 border-b border-docit-border bg-docit-bg-deep px-4 md:px-5 flex items-center justify-between select-none shrink-0">
                  <div className="flex items-center space-x-1.5">
                    <div className="flex space-x-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-docit-elevated" />
                      <div className="w-2.5 h-2.5 rounded-full bg-docit-elevated" />
                      <div className="w-2.5 h-2.5 rounded-full bg-docit-elevated" />
                    </div>
                    <div className="w-px h-3 bg-docit-elevated mx-2" />
                    <div className="flex items-center space-x-1.5 px-3 py-1 bg-docit-surface/60 border border-docit-border rounded-t-lg border-b-docit-bg-deep -mb-2.5 text-xs text-docit-text-muted font-semibold">
                      <span className="text-docit-accent-glow font-black text-[9px] uppercase tracking-wider">M↓</span>
                      <span className="font-mono">document.md</span>
                    </div>
                  </div>
                  {/* Word wrap quick toggle */}
                  <button
                    onClick={() => setWordWrap(!wordWrap)}
                    className={`text-[9px] uppercase font-black tracking-widest px-2 py-0.5 rounded border transition-colors ${wordWrap ? 'text-docit-accent-glow bg-docit-accent/10 border-docit-accent' : 'text-docit-text-tertiary bg-docit-surface border-docit-border'}`}
                    title="Toggle Text Wrap"
                  >
                    Wrap: {wordWrap ? 'ON' : 'OFF'}
                  </button>
                </div>
                
                {/* Textarea Editor */}
                <textarea
                  className="flex-1 w-full p-6 md:p-8 outline-none resize-none font-mono text-sm leading-relaxed text-docit-text-muted bg-docit-bg-deep/85 custom-scrollbar placeholder:text-docit-text-tertiary"
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  onPaste={(event) => {
                    const diagram = getChatGptDiagramPaste(event.clipboardData.getData('text/html'), theme.isDark);
                    if (!diagram) return;

                    event.preventDefault();
                    const textarea = event.currentTarget;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const before = textarea.value.slice(0, start);
                    const after = textarea.value.slice(end);
                    const insertion = `${before && !before.endsWith('\n') ? '\n\n' : ''}${diagram}${after && !after.startsWith('\n') ? '\n\n' : ''}`;
                    textarea.setRangeText(insertion, start, end, 'end');
                    setMarkdown(textarea.value);
                  }}
                  placeholder="Type your markdown here..."
                  spellCheck={false}
                />

                {/* Editor Footer Status Bar */}
                <div className="h-8 bg-docit-bg-deep border-t border-docit-border px-4 flex items-center justify-between text-[10px] text-docit-text-tertiary font-mono select-none shrink-0">
                  <div className="flex space-x-4">
                    <span>Lines: <strong className="text-docit-text-muted">{lineCount}</strong></span>
                    <span>Words: <strong className="text-docit-text-muted">{wordCount}</strong></span>
                    <span>Chars: <strong className="text-docit-text-muted">{charCount}</strong></span>
                  </div>
                  <span className="text-[9px] font-black uppercase text-docit-text-tertiary tracking-wider">Markdown GFM</span>
                </div>
              </div>
            </div>

            {/* Preview Pane (Read Mode) */}
            <div
              className={`
                flex-1 min-w-0 min-h-0 flex-col transition-all duration-300
                ${viewMode === 'preview' ? 'flex' : 'hidden md:flex md:w-1/2'}
                print:w-full print:block print:flex-none
              `}
            >
              <div className="flex-1 min-h-0 flex flex-col bg-docit-bg-deep md:rounded-2xl border border-docit-border shadow-2xl overflow-hidden print:block print:bg-transparent print:rounded-none print:border-none">
                
                {/* Preview File Tab Header */}
                <div className="h-11 border-b border-docit-border bg-docit-bg-deep px-4 md:px-5 flex items-center justify-between select-none shrink-0 print:hidden">
                  <div className="flex items-center space-x-1.5">
                    <div className="flex space-x-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-docit-elevated" />
                      <div className="w-2.5 h-2.5 rounded-full bg-docit-elevated" />
                      <div className="w-2.5 h-2.5 rounded-full bg-docit-elevated" />
                    </div>
                    <div className="w-px h-3 bg-docit-elevated mx-2" />
                    <div className="flex items-center space-x-1.5 px-3 py-1 bg-docit-surface/60 border border-docit-border rounded-t-lg border-b-docit-bg-deep -mb-2.5 text-xs text-docit-text-muted font-semibold">
                      <span className="text-emerald-400 font-black text-[9px] uppercase tracking-wider">PDF</span>
                      <span className="font-mono">export.pdf</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Header rules toggle */}
                    <button
                      onClick={() => setIgnoreHr(!ignoreHr)}
                      className={`text-[9px] uppercase font-black tracking-widest px-2 py-0.5 rounded border transition-colors ${!ignoreHr ? 'text-docit-accent-glow bg-docit-accent/10 border-docit-accent' : 'text-docit-text-tertiary bg-docit-surface border-docit-border'}`}
                      title="Toggle Horizontal Rules"
                    >
                      {ignoreHr ? 'No HR' : 'Show HR'}
                    </button>
                    <span className="text-[9px] font-black uppercase text-docit-text-tertiary tracking-wider">Live Preview</span>
                  </div>
                </div>

                {/* PDF rendering screen */}
                <div className="flex-1 min-h-0 overflow-hidden print:block print:overflow-visible">
                  <MarkdownPreview
                    content={markdown}
                    theme={theme}
                    ignoreHr={ignoreHr}
                    fontSize={fontSize}
                    wordWrap={wordWrap}
                    paddingSize={paddingSize}
                    headerText={headerText}
                    showPageNumbers={showPageNumbers}
                    codeFont={codeFont}
                    showLineNumbers={showLineNumbers}
                    codeWindowStyle={codeWindowStyle}
                    codeBlockBorder={codeBlockBorder}
                    codeBlockDark={codeBlockDark}
                    highlightStyle={highlightStyle}
                  />
                </div>
              </div>
            </div>

          </main>
        </div>

        {/* Mobile Settings Bottom Sheet (Backdrop drawer) */}
        {isMobileSettingsOpen && (
          <>
            {/* Dark blur backdrop overlay */}
            <div
              onClick={() => setIsMobileSettingsOpen(false)}
              className="md:hidden fixed inset-0 bg-black/75 backdrop-blur-sm z-[140] transition-opacity duration-300"
            />
            {/* Slide up sheet */}
            <div className="md:hidden fixed inset-x-0 bottom-0 max-h-[80vh] bg-docit-bg-deep border-t border-docit-border rounded-t-3xl z-[150] shadow-2xl flex flex-col transition-transform duration-300">
              {/* Drag Handle indicator */}
              <div className="w-12 h-1 bg-docit-elevated rounded-full mx-auto my-3 shrink-0" />
              
              <div className="px-6 pb-2 flex justify-between items-center border-b border-docit-border shrink-0">
                <span className="text-sm font-extrabold tracking-tight text-docit-text">Document settings</span>
                <button
                  onClick={() => setIsMobileSettingsOpen(false)}
                  className="text-xs font-bold text-docit-text-tertiary hover:text-docit-text"
                >
                  Close
                </button>
              </div>

              {/* Scrollable list content */}
              <div className="overflow-y-auto p-6 space-y-6 custom-scrollbar pb-24">
                {renderSettingsControls()}
              </div>
            </div>
          </>
        )}

        {/* Floating Bottom Navigation - Mobile Screen Mode only */}
        <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center p-1.5 bg-docit-surface/90 backdrop-blur-2xl rounded-2xl shadow-2xl border border-docit-border/80 print:hidden z-[100] gap-1">
          <button
            onClick={() => {
              setViewMode('editor');
              setIsMobileSettingsOpen(false);
            }}
            className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl transition-all ${viewMode === 'editor' && !isMobileSettingsOpen ? 'bg-docit-accent text-docit-text shadow shadow-docit-accent/30' : 'text-docit-text-muted hover:bg-docit-elevated'}`}
          >
            <PencilSquareIcon className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Write</span>
          </button>
          <button
            onClick={() => {
              setViewMode('preview');
              setIsMobileSettingsOpen(false);
            }}
            className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl transition-all ${viewMode === 'preview' && !isMobileSettingsOpen ? 'bg-docit-accent text-docit-text shadow shadow-docit-accent/30' : 'text-docit-text-muted hover:bg-docit-elevated'}`}
          >
            <EyeIcon className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Read</span>
          </button>
          <button
            onClick={() => setIsMobileSettingsOpen(true)}
            className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl transition-all ${isMobileSettingsOpen ? 'bg-docit-accent text-docit-text shadow shadow-docit-accent/30' : 'text-docit-text-muted hover:bg-docit-elevated'}`}
          >
            <AdjustmentsHorizontalIcon className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Settings</span>
          </button>
        </div>
      </div>
    </>
  );
}

export default App;
