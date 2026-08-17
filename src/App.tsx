import { Navigate, Route, Routes } from 'react-router-dom';
import InterceptorSetup from './components/InterceptorSetup';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import LoginPage from './pages/LoginPage';
import PagesPage from './pages/PagesPage';
import SectionsPage from './pages/SectionsPage';
import BlogsPage from './pages/BlogsPage';
import PostsPage from './pages/PostsPage';
import PostEditorPage from './pages/PostEditorPage';
import PostPreviewPage from './pages/PostPreviewPage';
import MediaPage from './pages/MediaPage';
import VersionsPage from './pages/VersionsPage';
import PreviewPage from './pages/PreviewPage';
import IntegrationsPage from './pages/IntegrationsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AgentsPage from './pages/AgentsPage';
import ResumesPage from './pages/ResumesPage';

export default function App() {
  return (
    <>
      <InterceptorSetup />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/sections" replace />} />
            <Route path="/pages" element={<PagesPage />} />
            <Route path="/sections" element={<SectionsPage />} />
            <Route path="/blogs" element={<BlogsPage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:id" element={<PostEditorPage />} />
            <Route path="/posts/:id/preview" element={<PostPreviewPage />} />
            <Route path="/media" element={<MediaPage />} />
            <Route path="/versions" element={<VersionsPage />} />
            <Route path="/preview" element={<PreviewPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/resumes" element={<ResumesPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
