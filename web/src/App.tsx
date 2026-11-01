import { Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/Dashboard';
import { GoalPage } from './pages/Goal';
import { SettingsPage } from './pages/Settings';
import { StatsPage } from './pages/Stats';
import { TransactionsPage } from './pages/Transactions';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/goal" element={<GoalPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Routes>
    </AppShell>
  );
}
