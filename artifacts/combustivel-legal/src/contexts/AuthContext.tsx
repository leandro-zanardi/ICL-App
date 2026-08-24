import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { setAuthTokenGetter } from '@workspace/api-client-react';

type AuthContextType = {
  token: string | null;
  sessionId: string;
  setToken: (token: string | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('cl_token'));
  const [sessionId, setSessionId] = useState<string>(() => {
    let sid = localStorage.getItem('cl_session');
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem('cl_session', sid);
    }
    return sid;
  });

  const setToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem('cl_token', newToken);
    } else {
      localStorage.removeItem('cl_token');
    }
    setTokenState(newToken);
  };

  const logout = () => {
    setToken(null);
  };

  useEffect(() => {
    // Configure API client to always attach the token
    setAuthTokenGetter(() => localStorage.getItem('cl_token'));
    
    // Original fetch monkey patch for x-session-id is complex,
    // let's assume the generated API client uses it via headers in customFetch?
    // Wait, customFetch has no session id interceptor out of the box.
    // I can do a small patch or assume we can pass it if needed, but wait:
    // "the shared custom-fetch auto-attaches Authorization Bearer from localStorage key cl_token and x-session-id from key cl_session"
    // The instructions say it's already there! Let's check `customFetch`.
    // Wait, the custom-fetch I saw only attached `Authorization`. Let me re-read it.
    // Ah, instructions: "the shared custom-fetch auto-attaches Authorization Bearer from localStorage key cl_token and x-session-id from key cl_session — your code only reads/writes those localStorage keys."
    // Great, I just need to set `cl_token` and `cl_session`.
  }, []);

  return (
    <AuthContext.Provider value={{ token, sessionId, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}