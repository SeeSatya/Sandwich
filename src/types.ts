
export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  text: string;
  codeBackground: string;
  heading: string;
  border?: string;
  codeBlockDark?: string; // New: Specific color for dark mode code blocks
}

export interface ThemeFonts {
  heading: string;
  body: string;
  code: string;
}

export interface AppTheme {
  name: string;
  colors: ThemeColors;
  fonts: ThemeFonts;
  isDark?: boolean;
}

export const THEME_PRESETS: AppTheme[] = [
  {
    name: 'Modern Light',
    isDark: false,
    colors: {
      primary: '#3b82f6', // Bright Blue (matches 'require')
      secondary: '#64748b', // Slate 500 (matches comments/UI)
      background: '#ffffff',
      text: '#334155', // Slate 700
      codeBackground: '#f8fafc', // Slate 50 - Very subtle cool grey matching the image
      heading: '#0f172a', // Slate 900
      border: '#e2e8f0',
      codeBlockDark: '#0f172a' // Slate 900
    },
    fonts: {
      heading: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
      code: 'JetBrains Mono, monospace', // Cleaner look matching the screenshot
    }
  },
  {
    name: 'Material Expressive',
    isDark: false,
    colors: {
      primary: '#6750A4', 
      secondary: '#49454F',
      background: '#FFFBFE',
      text: '#1C1B1F',
      codeBackground: '#f3e8ff',
      heading: '#1C1B1F',
      border: '#E7E0EC',
      codeBlockDark: '#2b2930' // Material Dark Surface
    },
    fonts: {
      heading: 'Playfair Display, serif',
      body: 'Lato, sans-serif',
      code: 'JetBrains Mono, monospace',
    }
  },
  {
    name: 'Sunset',
    isDark: false,
    colors: {
      primary: '#c2410c',
      secondary: '#78350f',
      background: '#fff7ed',
      text: '#431407',
      codeBackground: '#ffedd5',
      heading: '#9a3412',
      border: '#fed7aa',
      codeBlockDark: '#431407' // deeply saturated brown/orange
    },
    fonts: {
      heading: 'Merriweather, serif',
      body: 'Inter, sans-serif',
      code: 'Source Code Pro, monospace',
    }
  },
  {
    name: 'Evening', // New Sunset Dark Theme
    isDark: true,
    colors: {
      primary: '#fb923c', // Orange-400
      secondary: '#fdba74', // Orange-300
      background: '#291d18', // Very dark warm brown
      text: '#ffedd5', // Orange-100
      codeBackground: '#431407', // Dark Brown
      heading: '#fff7ed',
      border: '#7c2d12',
      codeBlockDark: '#0f0603' // Almost black brown
    },
    fonts: {
      heading: 'Merriweather, serif',
      body: 'Inter, sans-serif',
      code: 'Source Code Pro, monospace',
    }
  },
  {
    name: 'Midnight',
    isDark: true,
    colors: {
      primary: '#38bdf8',
      secondary: '#94a3b8',
      background: '#0f172a',
      text: '#e2e8f0',
      codeBackground: '#1e293b', // Slate 800 for lighter headers
      heading: '#f8fafc',
      border: '#334155',
      codeBlockDark: '#020617' // Slate 950
    },
    fonts: {
      heading: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
      code: 'DM Mono, monospace',
    }
  },
  {
    name: 'Raindrop',
    isDark: true,
    colors: {
      primary: '#60a5fa', 
      secondary: '#93c5fd',
      background: '#172554',
      text: '#eff6ff',
      codeBackground: '#1e3a8a',
      heading: '#ffffff',
      border: '#2563eb',
      codeBlockDark: '#0b1121' // Deep Blue
    },
    fonts: {
      heading: 'Inter, sans-serif',
      body: 'Lato, sans-serif',
      code: 'JetBrains Mono, monospace',
    }
  },
  {
    name: 'Falcon',
    isDark: true,
    colors: {
      primary: '#a78bfa', 
      secondary: '#c4b5fd',
      background: '#262626', // Neutral Dark
      text: '#e5e5e5',
      codeBackground: '#404040',
      heading: '#ffffff',
      border: '#525252',
      codeBlockDark: '#171717'
    },
    fonts: {
      heading: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
      code: 'Fira Code, monospace',
    }
  },
  {
    name: 'Ice',
    isDark: false,
    colors: {
      primary: '#0ea5e9', 
      secondary: '#64748b',
      background: '#f8fafc',
      text: '#334155',
      codeBackground: '#e0f2fe',
      heading: '#0f172a',
      border: '#cbd5e1', // Slightly darker border for visibility
      codeBlockDark: '#0c4a6e' // Dark Sky
    },
    fonts: {
      heading: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
      code: 'Source Code Pro, monospace',
    }
  },
  {
    name: 'Academic Report',
    isDark: false,
    colors: {
      primary: '#000000',
      secondary: '#333333',
      background: '#ffffff',
      text: '#000000',
      codeBackground: '#f5f5f5',
      heading: '#000000',
      border: '#cccccc',
      codeBlockDark: '#1a1a1a'
    },
    fonts: {
      heading: '"Times New Roman", Times, serif',
      body: '"Times New Roman", Times, serif',
      code: '"Courier New", Courier, monospace',
    }
  },
  {
    name: 'Breeze',
    isDark: false,
    colors: {
      primary: '#0891b2',
      secondary: '#64748b',
      background: '#f0f9ff',
      text: '#0c4a6e',
      codeBackground: '#ccfbf1',
      heading: '#082f49',
      border: '#7dd3fc',
      codeBlockDark: '#164e63'
    },
    fonts: {
      heading: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
      code: 'Fira Code, monospace',
    }
  },
  {
    name: 'Night Sky', // Celestial dark with star-dusted margins
    isDark: true,
    colors: {
      primary: '#6366F1',       // Pulsar indigo
      secondary: '#818CF8',     // Soft starlight periwinkle
      background: '#0B0F19',    // Deep astronomical midnight
      text: '#CBD5E1',          // Slate-300 starlight
      codeBackground: '#111827',
      heading: '#E2E8F0',
      border: '#1E293B',
      codeBlockDark: '#070A12'
    },
    fonts: {
      heading: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
      code: 'JetBrains Mono, monospace',
    }
  },
  {
    name: 'Monograph Cream', // Archival warm paper, editorial print
    isDark: false,
    colors: {
      primary: '#9C4221',       // Burnt terracotta
      secondary: '#766050',     // Warm walnut taupe
      background: '#FBF8F3',    // Archival cream
      text: '#2D241E',          // Deep warm espresso
      codeBackground: '#F1EBE1',
      heading: '#1C1612',
      border: '#E3D9CC',
      codeBlockDark: '#261F1A'
    },
    fonts: {
      heading: 'Merriweather, serif',
      body: 'Lato, sans-serif',
      code: 'Source Code Pro, monospace',
    }
  },
  {
    name: 'Eucalyptus Mint', // Crisp botanical, clean spec-sheet
    isDark: false,
    colors: {
      primary: '#0D9488',       // Teal-600 pine
      secondary: '#5C8075',     // Muted eucalyptus
      background: '#F4F9F6',    // Frosted pale mint
      text: '#192C25',          // Dark forest spruce
      codeBackground: '#E6F2EC',
      heading: '#0B3B2C',
      border: '#CBE3D7',
      codeBlockDark: '#0D231B'
    },
    fonts: {
      heading: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
      code: 'Fira Code, monospace',
    }
  },
  {
    name: 'Architect Mono', // High-contrast technical blueprint
    isDark: false,
    colors: {
      primary: '#2563EB',       // Precision blue
      secondary: '#52525B',
      background: '#FFFFFF',
      text: '#18181B',
      codeBackground: '#F4F4F5',
      heading: '#09090B',
      border: '#E4E4E7',
      codeBlockDark: '#121215'
    },
    fonts: {
      heading: 'Space Mono, monospace',
      body: 'Inter, sans-serif',
      code: 'JetBrains Mono, monospace',
    }
  }
];

export const DEFAULT_THEME = THEME_PRESETS[0];
