import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LandingPage } from './pages/LandingPage';
import { LobbyPage } from './pages/LobbyPage';
import { ScoutingPage } from './pages/ScoutingPage';
import { DraftPage } from './pages/DraftPage';
import { LivePage } from './pages/LivePage';
import { ResultsPage } from './pages/ResultsPage';
import { HostPage } from './pages/HostPage';
import { TestModePage } from './pages/TestModePage';
import { loadSession } from './lib/session';
import { useGameStore } from './store/gameStore';

function SessionRestore({ children }: { children: React.ReactNode }) {
  const { setSession } = useGameStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode) {
      window.history.replaceState({}, '', '/');
    }

    const session = loadSession();
    if (session) {
      setSession(session.sessionToken, session.playerId, session.roomCode, session.isHost);
    }

    const handleBeforeUnload = () => {
      // sessionStorage clears automatically on tab close
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [setSession]);

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionRestore>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/room/:code/lobby" element={<LobbyPage />} />
          <Route path="/room/:code/scouting" element={<ScoutingPage />} />
          <Route path="/room/:code/draft" element={<DraftPage />} />
          <Route path="/room/:code/live" element={<LivePage />} />
          <Route path="/room/:code/results" element={<ResultsPage />} />
          <Route path="/host/:code" element={<HostPage />} />
          <Route path="/test" element={<TestModePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#1A1A1F',
              color: '#fff',
              border: '1px solid #2A2A32',
            },
          }}
        />
      </SessionRestore>
    </BrowserRouter>
  );
}
