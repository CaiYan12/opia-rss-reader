import type { ThemeTokens } from '../../shared/types'

export const BUILTIN_THEMES: ThemeTokens[] = [
  {
    id: 'windows-light',
    name: 'Windows Light',
    builtin: true,
    colors: {
      bg: '#f3f3f3',
      surface: '#f9f9f9',
      card: '#ffffff',
      border: '#e0e0e0',
      text: '#1b1b1b',
      textSecondary: '#616161',
      accent: '#0067c0',
      accentHover: '#1975c5',
      onAccent: '#ffffff',
      chip: '#ececec',
      chipText: '#333333',
      read: '#9e9e9e'
    },
    fonts: {
      heading: "'Segoe UI', 'Noto Sans SC', sans-serif",
      body: "'Segoe UI', 'Noto Sans SC', sans-serif",
      sizeBase: 14
    },
    radius: 8,
    spacing: 12
  },
  {
    id: 'windows-dark',
    name: 'Windows Dark',
    builtin: true,
    colors: {
      bg: '#202020',
      surface: '#2b2b2b',
      card: '#2d2d2d',
      border: '#3f3f3f',
      text: '#f2f2f2',
      textSecondary: '#adadad',
      accent: '#4cc2ff',
      accentHover: '#69cdff',
      onAccent: '#0b2836',
      chip: '#3a3a3a',
      chipText: '#d5d5d5',
      read: '#6f6f6f'
    },
    fonts: {
      heading: "'Segoe UI', 'Noto Sans SC', sans-serif",
      body: "'Segoe UI', 'Noto Sans SC', sans-serif",
      sizeBase: 14
    },
    radius: 8,
    spacing: 12
  },
  {
    id: 'claude-design',
    name: 'Claude Design',
    builtin: true,
    colors: {
      bg: '#f5f4ed',
      surface: '#faf9f5',
      card: '#ffffff',
      border: '#e5e2d8',
      text: '#2b2823',
      textSecondary: '#6f6a5e',
      accent: '#d97757',
      accentHover: '#c1502e',
      onAccent: '#ffffff',
      chip: '#efede4',
      chipText: '#4a463c',
      read: '#a8a396'
    },
    fonts: {
      heading: "Georgia, 'Noto Serif SC', serif",
      body: "'Segoe UI', 'Noto Sans SC', sans-serif",
      sizeBase: 14
    },
    radius: 10,
    spacing: 12
  },
  {
    id: 'juya-daily',
    name: 'Juya Daily',
    builtin: true,
    colors: {
      bg: '#f6f3ea',
      surface: '#fbf9f3',
      card: '#fffdf8',
      border: '#e7e2d3',
      text: '#33302a',
      textSecondary: '#7a7263',
      accent: '#c1502e',
      accentHover: '#a8431f',
      onAccent: '#ffffff',
      chip: '#efeadd',
      chipText: '#5c5344',
      read: '#b0a795'
    },
    fonts: {
      heading: "Georgia, 'Noto Serif SC', serif",
      body: "'Segoe UI', 'Noto Sans SC', sans-serif",
      sizeBase: 15
    },
    radius: 12,
    spacing: 14
  }
]
