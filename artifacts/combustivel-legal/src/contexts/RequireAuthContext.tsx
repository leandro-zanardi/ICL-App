import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { OtpSheet } from '@/components/OtpSheet';

type RequireAuthContextType = {
  requireAuth: (action: () => void) => void;
};

const RequireAuthContext = createContext<RequireAuthContextType | undefined>(undefined);

export function RequireAuthProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const requireAuth = useCallback((action: () => void) => {
    if (token) {
      action();
    } else {
      setPendingAction(() => action);
      setIsOpen(true);
    }
  }, [token]);

  const handleSuccess = useCallback(() => {
    setIsOpen(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  return (
    <RequireAuthContext.Provider value={{ requireAuth }}>
      {children}
      <OtpSheet 
        isOpen={isOpen} 
        onOpenChange={setIsOpen} 
        onSuccess={handleSuccess} 
      />
    </RequireAuthContext.Provider>
  );
}

export function useRequireAuth() {
  const context = useContext(RequireAuthContext);
  if (context === undefined) {
    throw new Error('useRequireAuth must be used within a RequireAuthProvider');
  }
  return context;
}