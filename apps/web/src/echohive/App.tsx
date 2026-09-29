import React, { useState } from 'react';
import Login from '@pages/Login';
import EchoHiveShell from '@pages/EchoHiveShell';

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem('userId'));

  function handleLogin(nextToken: string, nextUserId: string) {
    localStorage.setItem('token', nextToken);
    localStorage.setItem('userId', nextUserId);
    setToken(nextToken);
    setUserId(nextUserId);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    setToken(null);
    setUserId(null);
  }

  if (!token || !userId) {
    return <Login onLogin={handleLogin} />;
  }

  return <EchoHiveShell currentUserId={userId} token={token} onLogout={handleLogout} />;
};

export default App;
