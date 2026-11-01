import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import '@fontsource-variable/inter';
import '@fontsource-variable/nunito';
import './themes/registry';
import './styles/global.css';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { TransactionSheetProvider } from './components/TransactionSheet';
import { PrefsProvider } from './lib/prefs';
import { safeStorage } from './lib/storage';
import { initTheme } from './lib/theme';

const DAY = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The server is the source of truth: refetch on focus and every minute while visible (spec §11).
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      gcTime: 7 * DAY,
      retry: 1,
    },
  },
});

// Last known data is kept on the device so the app opens read-only when offline.
const persister = createSyncStoragePersister({
  key: 'cairn.cache',
  storage: { getItem: safeStorage.get, setItem: safeStorage.set, removeItem: safeStorage.remove },
});

await initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * DAY, buster: 'v1' }}
    >
      <BrowserRouter>
        <PrefsProvider>
          <ToastProvider>
            <TransactionSheetProvider>
              <App />
            </TransactionSheetProvider>
          </ToastProvider>
        </PrefsProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
