import { useState } from 'react';

const STORAGE_KEY = 'mkb_sidebar_collapsed';

export function useSidebarCollapse() {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Fallback if localStorage is restricted
      }
      return next;
    });
  };

  return { isCollapsed, toggleCollapse };
}
