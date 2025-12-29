import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, LogIn } from 'lucide-react';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { success, error: loginError } = await login(email, password);
      if (success) {
        navigate('/');
      } else {
        setError(loginError || 'Invalid email or password.');
      }
    } catch (err) {
      setError('Failed to log in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <div className="w-full max-w-sm p-8 space-y-8 bg-white rounded-2xl shadow-xl">
        <div className="text-center">
            <div className="inline-block p-3 bg-emerald-500 rounded-xl mb-4">
              <ShoppingCart className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">AK Alheri Chemist</h1>
            <p className="text-sm text-slate-500">Please sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 mt-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="your@email.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 mt-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="password"
            />
          </div>
          
          {error && <p className="text-sm text-center text-red-500 bg-red-50 p-2 rounded-lg">{error}</p>}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  );
};

export default Login;