import { useEffect, useState } from 'react';
import { APP_NAME } from '@cairn/shared';

type Health = 'checking' | 'ok' | 'down';

// Placeholder shell until the design foundation (step 6) lands.
export function App() {
  const [health, setHealth] = useState<Health>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setHealth(res.ok ? 'ok' : 'down'))
      .catch(() => setHealth('down'));
  }, []);

  return (
    <main>
      <h1>{APP_NAME}</h1>
      <p>Server: {health}</p>
    </main>
  );
}
