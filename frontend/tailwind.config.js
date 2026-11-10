/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          deep: '#142B3A',
          DEFAULT: '#172B3A',
          muted: '#496171',
        },
        teal: {
          trust: '#0F766E',
          'trust-hover': '#0B5F59',
          'trust-light': '#F0FDFA',
        },
        canvas: '#F4F7F9',
        surface: '#FFFFFF',
        border: {
          DEFAULT: '#DCE5EA',
          subtle: '#EAEFF3',
        },
        focus: '#2563EB',
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
          'Manrope',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
        mono: [
          'Geist Mono',
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
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(20, 43, 58, 0.05), 0 1px 2px -1px rgba(20, 43, 58, 0.05)',
        'card-hover': '0 4px 6px -1px rgba(20, 43, 58, 0.08), 0 2px 4px -2px rgba(20, 43, 58, 0.05)',
        dropdown: '0 10px 15px -3px rgba(20, 43, 58, 0.08), 0 4px 6px -4px rgba(20, 43, 58, 0.04)',
      },
    },
  },
  plugins: [],
};

