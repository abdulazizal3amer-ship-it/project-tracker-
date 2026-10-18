import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/supabase.js';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { UsersProvider } from './lib/users.jsx';
import { I18nProvider, useI18n } from './i18n/index.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import { LoginPage, SetPasswordPage } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import ProjectView from './pages/ProjectView.jsx';
import MyTasks from './pages/MyTasks.jsx';
import Users from './pages/Users.jsx';
import Profile from './pages/Profile.jsx';
import TaskRedirect from './pages/TaskRedirect.jsx';

function NotConfigured() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-md p-6 text-sm text-slate-700">{t('app.notConfigured')}</div>
    </div>
  );
}

function Gate() {
  const { loading, session, profile, recovery, notice, signOut } = useAuth();
  const { t } = useI18n();

  if (!session) return <LoginPage />;
  if (recovery) return <SetPasswordPage />;
  if (loading) return <Spinner />;
  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-sm">
        <p>{notice ? t(notice) : t('errors.notFound')}</p>
        <button className="btn-secondary" onClick={signOut}>
          {t('nav.signOut')}
        </button>
      </div>
    );
  }
  if (profile.must_change_password) return <SetPasswordPage forced />;

  return (
    <UsersProvider>
      {/* HashRouter: GitHub Pages has no server-side routing. */}
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:id" element={<ProjectView />} />
            <Route path="task/:id" element={<TaskRedirect />} />
            <Route path="my-tasks" element={<MyTasks />} />
            <Route path="profile" element={<Profile />} />
            <Route path="users" element={<Users />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </UsersProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      {isConfigured ? (
        <AuthProvider>
          <Gate />
        </AuthProvider>
      ) : (
        <NotConfigured />
      )}
    </I18nProvider>
  );
}
