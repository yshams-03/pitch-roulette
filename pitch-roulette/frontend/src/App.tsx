import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuthStore } from './store/authStore';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ProfilePage, PublicProfilePage } from './pages/ProfilePage';
import { GroupsPage, GroupCreatePage, GroupJoinPage, GroupDetailPage } from './pages/GroupsPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { JoinRoomPage } from './pages/JoinRoomPage';
import { RoomLobbyPage } from './pages/RoomLobbyPage';
import { RoomPredictPage } from './pages/RoomPredictPage';
import { RoomResultsPage } from './pages/RoomResultsPage';
import { RoomLivePage } from './pages/RoomLivePage';
import { HostPanelPage } from './pages/HostPanelPage';
import { DemoSandboxPage } from './pages/DemoSandboxPage';

export default function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/signup" element={<SignupPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/join" element={<JoinRoomPage />} />
          <Route path="/profile/:username" element={<PublicProfilePage />} />

          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/groups" element={<ProtectedRoute><GroupsPage /></ProtectedRoute>} />
          <Route path="/groups/create" element={<ProtectedRoute><GroupCreatePage /></ProtectedRoute>} />
          <Route path="/groups/join" element={<ProtectedRoute><GroupJoinPage /></ProtectedRoute>} />
          <Route path="/groups/:id" element={<ProtectedRoute><GroupDetailPage /></ProtectedRoute>} />

          <Route path="/room/:code/lobby" element={<ProtectedRoute><RoomLobbyPage /></ProtectedRoute>} />
          <Route path="/room/:code/predict" element={<ProtectedRoute><RoomPredictPage /></ProtectedRoute>} />
          <Route path="/room/:code/live" element={<ProtectedRoute><RoomLivePage /></ProtectedRoute>} />
          <Route path="/room/:code/results" element={<RoomResultsPage />} />
          <Route path="/host/:code" element={<ProtectedRoute><HostPanelPage /></ProtectedRoute>} />
          <Route path="/demo" element={<ProtectedRoute><DemoSandboxPage /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <Toaster position="top-center" toastOptions={{
        style: { background: '#1A1A1F', color: '#fff', border: '1px solid #2A2A32' },
      }} />
    </BrowserRouter>
  );
}
