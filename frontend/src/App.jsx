import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useApi } from "./lib/api.js";
import { dateLabel } from "./lib/format.js";
import { ErrorNote, Loading } from "./components/ui.jsx";
import Sales from "./pages/Sales.jsx";
import Segments from "./pages/Segments.jsx";
import Churn from "./pages/Churn.jsx";

const PAGES = [
  { to: "/sales", label: "Sales", icon: "M3 13.5 7 9l3 2.5 6-7" },
  { to: "/segments", label: "Customer segments", icon: "M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z" },
  { to: "/churn", label: "Churn prediction", icon: "M10 3a7 7 0 1 0 7 7M10 6v4l3 2" },
];

function readTheme() {
  try {
    return localStorage.getItem("ci-theme");
  } catch {
    return null;
  }
}

function useTheme() {
  const [theme, setTheme] = useState(
    () => readTheme() || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("ci-theme", theme);
    } catch {
      /* private window: the choice just won't be remembered */
    }
  }, [theme]);
  return [theme, () => setTheme(theme === "dark" ? "light" : "dark")];
}

function Rail({ meta, theme, toggleTheme }) {
  return (
    <aside className="flex shrink-0 flex-col bg-rail text-rail-ink lg:sticky lg:top-0 lg:h-screen lg:w-[236px]">
      <div className="px-5 pb-3 pt-5 lg:pb-6">
        <div className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">Customer Intelligence</div>
        <div className="mt-1 text-[12.5px] leading-snug text-rail-ink-2">Online retail, UK giftware</div>
      </div>

      <nav aria-label="Pages" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
        {PAGES.map((page) => (
          <NavLink
            key={page.to}
            to={page.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-[14px] font-medium transition-colors ${
                isActive ? "bg-rail-active text-rail-ink" : "text-rail-ink-2 hover:text-rail-ink"
              }`
            }
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d={page.icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {page.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto hidden px-5 pb-5 text-[12.5px] leading-snug text-rail-ink-2 lg:block">
        {meta && (
          <p className="m-0">
            Historical data from {dateLabel(meta.data.start)} to {dateLabel(meta.data.end)}. Scores describe that
            period, not today's customers.
          </p>
        )}
        <button
          type="button"
          onClick={toggleTheme}
          className="mt-4 rounded-md px-0 py-1 text-[12.5px] font-medium text-rail-ink underline decoration-rail-ink-2 underline-offset-4 hover:decoration-rail-ink"
        >
          Switch to {theme === "dark" ? "light" : "dark"} mode
        </button>
      </div>
    </aside>
  );
}

export default function App() {
  const { data: meta, error, loading } = useApi("/meta");
  const [theme, toggleTheme] = useTheme();

  return (
    <div className="min-h-screen lg:flex">
      <Rail meta={meta} theme={theme} toggleTheme={toggleTheme} />
      <main className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-7 lg:px-9 lg:pt-8">
        <div className="mx-auto max-w-[1240px]">
          {loading && <Loading label="Loading data and models" />}
          {error && <ErrorNote error={error} />}
          {meta && (
            <Routes>
              <Route path="/" element={<Navigate to="/sales" replace />} />
              <Route path="/sales" element={<Sales meta={meta} />} />
              <Route path="/segments" element={<Segments meta={meta} />} />
              <Route path="/churn" element={<Churn meta={meta} />} />
              <Route path="*" element={<Navigate to="/sales" replace />} />
            </Routes>
          )}
        </div>
      </main>
    </div>
  );
}
