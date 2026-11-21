/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          deep: '#142B3A',
          DEFAULT: '#142B3A',
          700: '#1E3A5F',
          muted: '#496171',
        },
        brand: {
          50: '#F0FDFA',
          600: '#0F766E',
          700: '#0F766E',
          800: '#115E59',
        },
        teal: {
          trust: '#0F766E',
          'trust-hover': '#0B5F59',
          'trust-light': '#F0FDFA',
        },
        canvas: '#F4F7F9',
        surface: '#FFFFFF',
        line: '#DCE5EA',
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
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono)'],
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

