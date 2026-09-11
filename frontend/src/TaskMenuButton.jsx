import React, { useEffect, useState } from 'react';

export default function TaskMenuButton({ request, disabled, onClick }) {
  const [count, setCount] = useState(null);
  useEffect(() => {
    let mounted = true;
    let pending = false;
    async function refresh() {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const response = await request('tasks/my-open-count', { cache: 'no-store' });
        if (!response.ok) throw new Error('Zähler nicht verfügbar');
        const data = await response.json();
        if (!Number.isSafeInteger(data.count) || data.count < 0) throw new Error('Ungültiger Zähler');
        if (mounted) setCount(data.count);
      } catch { if (mounted) setCount(null); }
      finally { pending = false; }
    }
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <button className="main-func-btn todo-menu-button" disabled={disabled} onClick={onClick}
    aria-label={count === null ? 'To-dos öffnen, Anzahl derzeit nicht verfügbar' : `To-dos öffnen, ${count} eigene offene To-dos`}>
    <span>📝 To-dos</span>
    {count > 0 && <span className="todo-count-badge" aria-hidden="true">{count}</span>}
  </button>;
}
