/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          deep: '#0B1F3A',
          DEFAULT: '#0B1F3A',
          700: '#1E3A5F',
          muted: '#496171',
        },
        brand: {
          50: '#F0FDFA',
          600: '#0D9488',
          700: '#0F766E',
          800: '#115E59',
        },
        teal: {
          trust: '#0F766E',
          'trust-hover': '#0D9488',
          'trust-light': '#F0FDFA',
        },
        canvas: '#F6F7F9',
        surface: '#FFFFFF',
        line: '#E3E7ED',
        border: {
          DEFAULT: '#E3E7ED',
          subtle: '#EAEFF3',
        },
        focus: '#0F766E',
        semantic: {
          success: {
            fg: '#166534',
            bg: '#F0FDF4',
            border: '#BBF7D0',
          },
          warning: {
            fg: '#92400E',
            bg: '#FFFBEB',
            border: '#FDE68A',
          },
          danger: {
            fg: '#B42318',
            bg: '#FEF2F2',
            border: '#FECACA',
          },
          info: {
            fg: '#1D4ED8',
            bg: '#EFF6FF',
            border: '#BFDBFE',
          },
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
        serif: [
          '"Source Serif 4"',
          'ui-serif',
          'Georgia',
          'Cambria',
          '"Times New Roman"',
          'Times',
          'serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace',
        ],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
        card: '10px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 31, 58, 0.06)',
        'card-hover': '0 4px 6px -1px rgba(11, 31, 58, 0.08), 0 2px 4px -2px rgba(11, 31, 58, 0.05)',
        dropdown: '0 10px 15px -3px rgba(11, 31, 58, 0.08), 0 4px 6px -4px rgba(11, 31, 58, 0.04)',
      },
    },
  },
  plugins: [],
};

