import React, { useState, useEffect, useRef } from 'react';
import { generateThemeFromText } from './services/geminiService';
import { generatePdf } from './services/pdfService';
import { exportDocx } from './docxExport';
import MarkdownPreview from './components/MarkdownPreview';
import { AppTheme, DEFAULT_THEME, THEME_PRESETS } from './types';
import {
  DocumentTextIcon,
  PrinterIcon,
  SparklesIcon,
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
  PaintBrushIcon
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

3. **Tables & Lists**
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

  const [isGeneratingTheme, setIsGeneratingTheme] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('editor');

  // DOCX export progress (null = idle)
  const [docxProgress, setDocxProgress] = useState<{ pct: number; label: string } | null>(null);

  // Sidebar toggles for Desktop & Mobile settings drawer
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);

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

  const handleAITheme = async () => {
    if (!process.env.API_KEY) {
      alert("API_KEY environment variable is missing.");
      return;
    }
    setIsGeneratingTheme(true);
    try {
      const newTheme = await generateThemeFromText(markdown);
      setTheme(newTheme);
      if (window.innerWidth < 768) setViewMode('preview');
    } catch (error) {
      alert("Style generation failed. Please check your connection.");
    } finally {
      setIsGeneratingTheme(false);
    }
  };

  const handleReset = () => {
    if (confirm("Reset current progress?")) {
      setMarkdown(INITIAL_MARKDOWN);
      setTheme(DEFAULT_THEME);
    }
  };

  // Helper render to share settings between sidebar and mobile drawer
  const renderSettingsControls = () => (
    <div className="space-y-6 text-zinc-300">
      {/* Document Styling Section */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-2 flex items-center gap-2">
          <SwatchIcon className="w-4 h-4 text-violet-400" /> Document Theme
        </h3>
        
        {/* Theme Preset */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-400">Preset Theme</label>
          <div className="relative">
            <select
              value={theme.name}
              onChange={(e) => {
                const selected = THEME_PRESETS.find(t => t.name === e.target.value);
                if (selected) setTheme(selected);
              }}
              className="w-full bg-zinc-900 text-zinc-200 text-sm font-semibold rounded-lg border border-zinc-800 py-2.5 px-3 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all cursor-pointer appearance-none animate-none"
            >
              {THEME_PRESETS.map(t => (
                <option key={t.name} value={t.name} className="bg-zinc-950 text-zinc-200">{t.name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-500 text-xs">▼</div>
          </div>
        </div>

        {/* Custom Color Selector (Visible only for Material Expressive) */}
        {theme.name === 'Material Expressive' && (
          <div className="space-y-1.5 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/80">
            <label className="text-xs font-bold text-zinc-400 block mb-1">Accent Brand Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-none p-0 outline-none"
              />
              <span className="text-xs font-mono text-zinc-300">{customColor.toUpperCase()}</span>
            </div>
          </div>
        )}

        {/* Font Size */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-bold text-zinc-400">
            <label>Base Font Size</label>
            <span className="font-mono text-violet-400">{fontSize}px</span>
          </div>
          <input
            type="range" min="10" max="24" step="1"
            value={fontSize}
            onChange={e => setFontSize(parseInt(e.target.value))}
            className="w-full accent-violet-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Padding Size */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-400">Page Margins (Padding)</label>
          <div className="relative">
            <select
              value={paddingSize}
              onChange={(e) => setPaddingSize(e.target.value as PaddingSize)}
              className="w-full bg-zinc-900 text-zinc-200 text-sm font-semibold rounded-lg border border-zinc-800 py-2.5 px-3 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all cursor-pointer appearance-none"
            >
              <option value="small" className="bg-zinc-950">Small (12.7mm)</option>
              <option value="medium" className="bg-zinc-950">Medium (25.4mm)</option>
              <option value="large" className="bg-zinc-950">Large (35.0mm)</option>
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-500 text-xs">▼</div>
          </div>
        </div>
      </div>

      {/* Code Blocks Styling */}
      <div className="space-y-4 pt-2">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-2 flex items-center gap-2">
          <CodeBracketIcon className="w-4 h-4 text-violet-400" /> Code Block Styling
        </h3>

        {/* Font */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-400">Monospace Font</label>
          <div className="relative">
            <select
              value={codeFont}
              onChange={(e) => setCodeFont(e.target.value)}
              className="w-full bg-zinc-900 text-zinc-200 text-sm font-semibold rounded-lg border border-zinc-800 py-2.5 px-3 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all cursor-pointer appearance-none"
            >
              <option value="JetBrains Mono, monospace" className="bg-zinc-950">JetBrains Mono</option>
              <option value="Space Mono, monospace" className="bg-zinc-950">Space Mono</option>
              <option value="Fira Code, monospace" className="bg-zinc-950">Fira Code</option>
              <option value="DM Mono, monospace" className="bg-zinc-950">DM Mono</option>
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-500 text-xs">▼</div>
          </div>
        </div>

        {/* Highlight Theme */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-400">Syntax Highlight Theme</label>
          <div className="relative">
            <select
              value={highlightStyle}
              onChange={(e) => setHighlightStyle(e.target.value)}
              className="w-full bg-zinc-900 text-zinc-200 text-sm font-semibold rounded-lg border border-zinc-800 py-2.5 px-3 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all cursor-pointer appearance-none"
            >
              <option value="default" className="bg-zinc-950">Default (System-Matched)</option>
              <option value="dracula" className="bg-zinc-950">Dracula</option>
              <option value="atomDark" className="bg-zinc-950">Atom Dark</option>
              <option value="vscDarkPlus" className="bg-zinc-950">VS Code Dark</option>
              <option value="oneDark" className="bg-zinc-950">One Dark</option>
              <option value="github" className="bg-zinc-950">GitHub Light</option>
              <option value="vs" className="bg-zinc-950">VS Light</option>
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-500 text-xs">▼</div>
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-3 pt-1">
          {/* Code Window Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
              <WindowIcon className="w-4 h-4 text-zinc-500" />
              <span>IDE Style Window Header</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox" checked={codeWindowStyle}
                onChange={() => setCodeWindowStyle(!codeWindowStyle)}
                className="sr-only switch-checkbox"
              />
              <div className="w-9 h-5 bg-zinc-800 rounded-full switch-label transition-colors duration-200 p-0.5 border border-zinc-700">
                <div className={`w-3.5 h-3.5 bg-zinc-50 rounded-full transition-transform duration-200 switch-dot ${codeWindowStyle ? 'translate-x-4' : ''}`} />
              </div>
            </label>
          </div>

          {/* Code line numbers */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
              <HashtagIcon className="w-4 h-4 text-zinc-500" />
              <span>Show Line Numbers</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox" checked={showLineNumbers}
                onChange={() => setShowLineNumbers(!showLineNumbers)}
                className="sr-only switch-checkbox"
              />
              <div className="w-9 h-5 bg-zinc-800 rounded-full switch-label transition-colors duration-200 p-0.5 border border-zinc-700">
                <div className={`w-3.5 h-3.5 bg-zinc-50 rounded-full transition-transform duration-200 switch-dot ${showLineNumbers ? 'translate-x-4' : ''}`} />
              </div>
            </label>
          </div>

          {/* Code box theme */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
              {codeBlockDark ? <MoonIcon className="w-4 h-4 text-violet-400" /> : <SunIcon className="w-4 h-4 text-zinc-500" />}
              <span>Dark Code Container</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox" checked={codeBlockDark}
                onChange={() => setCodeBlockDark(!codeBlockDark)}
                className="sr-only switch-checkbox"
              />
              <div className="w-9 h-5 bg-zinc-800 rounded-full switch-label transition-colors duration-200 p-0.5 border border-zinc-700">
                <div className={`w-3.5 h-3.5 bg-zinc-50 rounded-full transition-transform duration-200 switch-dot ${codeBlockDark ? 'translate-x-4' : ''}`} />
              </div>
            </label>
          </div>

          {/* Code Border */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
              <Square2StackIcon className="w-4 h-4 text-zinc-500" />
              <span>Container Outline Border</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox" checked={codeBlockBorder}
                onChange={() => setCodeBlockBorder(!codeBlockBorder)}
                className="sr-only switch-checkbox"
              />
              <div className="w-9 h-5 bg-zinc-800 rounded-full switch-label transition-colors duration-200 p-0.5 border border-zinc-700">
                <div className={`w-3.5 h-3.5 bg-zinc-50 rounded-full transition-transform duration-200 switch-dot ${codeBlockBorder ? 'translate-x-4' : ''}`} />
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Metadata & PDF Headers */}
      <div className="space-y-4 pt-2">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 border-b border-zinc-800 pb-2 flex items-center gap-2">
          <ArrowsPointingOutIcon className="w-4 h-4 text-violet-400" /> Page & PDF Headers
        </h3>

        {/* Header Text */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-400">Custom Document Header</label>
          <input
            type="text"
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            placeholder="e.g. Confidential, Draft v1"
            className="w-full bg-zinc-900 text-zinc-200 text-sm font-semibold rounded-lg border border-zinc-800 py-2 px-3 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all placeholder-zinc-650"
          />
        </div>

        {/* Page Numbering */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
            <span>Show Page Numbers</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox" checked={showPageNumbers}
              onChange={() => setShowPageNumbers(!showPageNumbers)}
              className="sr-only switch-checkbox"
            />
            <div className="w-9 h-5 bg-zinc-800 rounded-full switch-label transition-colors duration-200 p-0.5 border border-zinc-700">
              <div className={`w-3.5 h-3.5 bg-zinc-50 rounded-full transition-transform duration-200 switch-dot ${showPageNumbers ? 'translate-x-4' : ''}`} />
            </div>
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* DOCX export progress overlay */}
      {docxProgress && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm print:hidden">
          <div className="w-80 max-w-[90vw] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-2">
              <DocumentTextIcon className="w-5 h-5 text-violet-400" />
              <span className="text-sm font-bold text-zinc-100">Building DOCX</span>
            </div>
            <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all duration-200 ease-out"
                style={{ width: `${docxProgress.pct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-400">
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
      <div className="h-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans flex flex-col print:h-auto print:min-h-screen print:overflow-visible print:bg-transparent selection:bg-violet-500/30 selection:text-violet-300">
        
        {/* Railway Sleek Header */}
        <header className="h-16 shrink-0 flex items-center justify-between px-4 md:px-6 bg-[#09090b] border-b border-zinc-800 print:hidden z-50">
          <div className="flex items-center space-x-3 md:space-x-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden md:flex p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 transition-all active:scale-95"
              title="Toggle Config Sidebar"
            >
              <AdjustmentsHorizontalIcon className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-tr from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20">
                <DocumentTextIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-base font-extrabold tracking-tight text-white block leading-none">MarkMind</span>
                <span className="text-[8px] uppercase tracking-widest text-zinc-500 font-black leading-none mt-0.5 block">Railway Engine</span>
              </div>
            </div>
            <div className="flex items-center space-x-1.5 bg-zinc-900/50 px-2 py-0.5 rounded border border-zinc-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-green"></span>
              <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-bold">READY</span>
            </div>
          </div>

          {/* Actions Menu */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleAITheme}
              disabled={isGeneratingTheme}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-500 border border-violet-500 shadow-md shadow-violet-500/10 active:scale-95 disabled:opacity-50 transition-all select-none"
            >
              {isGeneratingTheme ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <SparklesIcon className="w-3.5 h-3.5" />}
              <span>{isGeneratingTheme ? 'Thinking...' : 'AI Style'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 active:scale-95 transition-all select-none"
            >
              <PrinterIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export PDF</span>
            </button>
            <button
              onClick={handleExportDoc}
              disabled={!!docxProgress}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 active:scale-95 transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DocumentTextIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{docxProgress ? 'Exporting…' : 'Export DOCX'}</span>
            </button>
            <button
              onClick={handleReset}
              className="p-2 rounded-lg bg-zinc-900 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 border border-zinc-800 hover:border-red-900/50 transition-all active:scale-95"
              title="Reset Project"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main responsive dashboard layout */}
        <div className="flex-1 min-h-0 flex overflow-hidden relative print:block">
          
          {/* Left Config Sidebar (Desktop) */}
          <aside
            className={`
              shrink-0 self-stretch h-full border-r border-zinc-800 bg-[#09090b] flex-col overflow-y-auto custom-scrollbar
              hidden md:flex transition-all duration-300
              ${isSidebarOpen ? 'w-80 p-6 space-y-6 opacity-100' : 'w-0 p-0 opacity-0 overflow-hidden border-none'}
              print:hidden
            `}
          >
            <div className="flex justify-between items-center pb-2">
              <span className="text-[10px] font-black tracking-widest text-zinc-500 uppercase">Configuration</span>
              <span className="text-[8px] font-bold text-zinc-600 bg-zinc-900/80 px-1.5 py-0.5 rounded border border-zinc-800">Local</span>
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
              <div className="flex-1 min-h-0 flex flex-col bg-zinc-950 md:rounded-2xl border border-zinc-850 shadow-2xl overflow-hidden focus-within:ring-2 focus-within:ring-violet-500/30 focus-within:border-violet-500/70 transition-all">
                {/* Editor File Tab Header */}
                <div className="h-11 border-b border-zinc-850 bg-zinc-950 px-4 md:px-5 flex items-center justify-between select-none shrink-0">
                  <div className="flex items-center space-x-1.5">
                    <div className="flex space-x-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                    </div>
                    <div className="w-px h-3 bg-zinc-800 mx-2" />
                    <div className="flex items-center space-x-1.5 px-3 py-1 bg-zinc-900/60 border border-zinc-800 rounded-t-lg border-b-zinc-950 -mb-2.5 text-xs text-zinc-300 font-semibold">
                      <span className="text-violet-400 font-black text-[9px] uppercase tracking-wider">M↓</span>
                      <span className="font-mono">document.md</span>
                    </div>
                  </div>
                  {/* Word wrap quick toggle */}
                  <button
                    onClick={() => setWordWrap(!wordWrap)}
                    className={`text-[9px] uppercase font-black tracking-widest px-2 py-0.5 rounded border transition-colors ${wordWrap ? 'text-violet-400 bg-violet-500/10 border-violet-500/30' : 'text-zinc-600 bg-zinc-900 border-zinc-800'}`}
                    title="Toggle Text Wrap"
                  >
                    Wrap: {wordWrap ? 'ON' : 'OFF'}
                  </button>
                </div>
                
                {/* Textarea Editor */}
                <textarea
                  className="flex-1 w-full p-6 md:p-8 outline-none resize-none font-mono text-sm leading-relaxed text-zinc-300 bg-zinc-950/85 custom-scrollbar placeholder-zinc-800"
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  placeholder="Type your markdown here..."
                  spellCheck={false}
                />

                {/* Editor Footer Status Bar */}
                <div className="h-8 bg-zinc-950 border-t border-zinc-850 px-4 flex items-center justify-between text-[10px] text-zinc-500 font-mono select-none shrink-0">
                  <div className="flex space-x-4">
                    <span>Lines: <strong className="text-zinc-400">{lineCount}</strong></span>
                    <span>Words: <strong className="text-zinc-400">{wordCount}</strong></span>
                    <span>Chars: <strong className="text-zinc-400">{charCount}</strong></span>
                  </div>
                  <span className="text-[9px] font-black uppercase text-zinc-600 tracking-wider">Markdown GFM</span>
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
              <div className="flex-1 min-h-0 flex flex-col bg-zinc-950 md:rounded-2xl border border-zinc-850 shadow-2xl overflow-hidden print:block print:bg-transparent print:rounded-none print:border-none">
                
                {/* Preview File Tab Header */}
                <div className="h-11 border-b border-zinc-850 bg-zinc-950 px-4 md:px-5 flex items-center justify-between select-none shrink-0 print:hidden">
                  <div className="flex items-center space-x-1.5">
                    <div className="flex space-x-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                    </div>
                    <div className="w-px h-3 bg-zinc-800 mx-2" />
                    <div className="flex items-center space-x-1.5 px-3 py-1 bg-zinc-900/60 border border-zinc-800 rounded-t-lg border-b-zinc-950 -mb-2.5 text-xs text-zinc-300 font-semibold">
                      <span className="text-emerald-400 font-black text-[9px] uppercase tracking-wider">PDF</span>
                      <span className="font-mono">export.pdf</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Header rules toggle */}
                    <button
                      onClick={() => setIgnoreHr(!ignoreHr)}
                      className={`text-[9px] uppercase font-black tracking-widest px-2 py-0.5 rounded border transition-colors ${!ignoreHr ? 'text-violet-400 bg-violet-500/10 border-violet-500/30' : 'text-zinc-600 bg-zinc-900 border-zinc-800'}`}
                      title="Toggle Horizontal Rules"
                    >
                      {ignoreHr ? 'No HR' : 'Show HR'}
                    </button>
                    <span className="text-[9px] font-black uppercase text-zinc-600 tracking-wider">Live Preview</span>
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
            <div className="md:hidden fixed inset-x-0 bottom-0 max-h-[80vh] bg-zinc-950 border-t border-zinc-800 rounded-t-3xl z-[150] shadow-2xl flex flex-col transition-transform duration-300">
              {/* Drag Handle indicator */}
              <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto my-3 shrink-0" />
              
              <div className="px-6 pb-2 flex justify-between items-center border-b border-zinc-900 shrink-0">
                <span className="text-sm font-extrabold tracking-tight text-white">Document settings</span>
                <button
                  onClick={() => setIsMobileSettingsOpen(false)}
                  className="text-xs font-bold text-zinc-500 hover:text-zinc-200"
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
        <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center p-1.5 bg-zinc-900/90 backdrop-blur-2xl rounded-2xl shadow-2xl border border-zinc-800/80 print:hidden z-[100] gap-1">
          <button
            onClick={() => {
              setViewMode('editor');
              setIsMobileSettingsOpen(false);
            }}
            className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl transition-all ${viewMode === 'editor' && !isMobileSettingsOpen ? 'bg-violet-600 text-white shadow shadow-violet-500/20' : 'text-zinc-400 hover:bg-zinc-800'}`}
          >
            <PencilSquareIcon className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Write</span>
          </button>
          <button
            onClick={() => {
              setViewMode('preview');
              setIsMobileSettingsOpen(false);
            }}
            className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl transition-all ${viewMode === 'preview' && !isMobileSettingsOpen ? 'bg-violet-600 text-white shadow shadow-violet-500/20' : 'text-zinc-400 hover:bg-zinc-800'}`}
          >
            <EyeIcon className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Read</span>
          </button>
          <button
            onClick={() => setIsMobileSettingsOpen(true)}
            className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl transition-all ${isMobileSettingsOpen ? 'bg-violet-600 text-white shadow shadow-violet-500/20' : 'text-zinc-400 hover:bg-zinc-800'}`}
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
