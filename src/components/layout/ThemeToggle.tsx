import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/**
 * ThemeToggle — a pill-style switch with a sliding indicator.
 * Uses CSS custom properties so it adapts to both themes.
 */
export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      id="theme-toggle-btn"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`
        relative flex items-center gap-1.5 px-1.5 py-1.5 rounded-full
        border transition-all duration-300 cursor-pointer select-none
        w-[68px] h-[32px] shrink-0
        ${isDark
          ? 'bg-slate-800 border-slate-700 hover:border-slate-600'
          : 'bg-slate-800 border-slate-700 hover:border-slate-600'
        }
      `}
    >
      {/* Sliding pill indicator */}
      <span
        className={`
          absolute top-[3px] w-[24px] h-[24px] rounded-full
          flex items-center justify-center
          transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          ${isDark
            ? 'left-[3px] bg-slate-600'
            : 'left-[39px] bg-cyan-500/80'
          }
        `}
      >
        {isDark
          ? <Moon className="w-3 h-3 text-slate-300" />
          : <Sun  className="w-3 h-3 text-white" />
        }
      </span>

      {/* Static icon hints (always visible) */}
      <Moon className={`w-3 h-3 ml-[5px] shrink-0 transition-colors ${isDark ? 'text-cyan-400' : 'text-slate-500'}`} />
      <Sun  className={`w-3 h-3 ml-auto mr-[5px] shrink-0 transition-colors ${!isDark ? 'text-white opacity-0' : 'text-slate-500'}`} />
    </button>
  );
};
