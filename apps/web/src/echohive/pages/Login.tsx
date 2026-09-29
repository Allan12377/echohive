import React, { useState, FormEvent } from 'react';
import { login, register } from '@services/authService';

interface Props {
  onLogin: (token: string, userId: string) => void;
}

const Login: React.FC<Props> = ({ onLogin }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { token, user } = mode === 'login'
        ? await login(email, password)
        : await register(username, email, password);
      localStorage.setItem('token', token);
      onLogin(token, user.id);
    } catch {
      setError(mode === 'login' ? 'Invalid email or password' : 'Could not create account. Check your details and try again.');
    }
  }

  return (
    <main className="auth-screen">
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-brand"><img className="brand-mark" src="/echohive-icon.svg" alt="" /><span>EchoHive</span></div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {mode === 'register' && (
          <div className="auth-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={30}
              autoComplete="username"
              required
            />
          </div>
        )}
        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </div>
        <button type="submit" className="auth-submit">
          {mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
        <p className="auth-switch">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </form>
    </main>
  );
};

export default Login;
