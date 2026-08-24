import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import { LocationProvider } from '@/contexts/LocationContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { RequireAuthProvider } from '@/contexts/RequireAuthContext';
import { DenunciaQueueProvider } from '@/contexts/DenunciaQueueContext';
import { ConsumerLayout } from '@/components/Layout';

const Mapa = lazy(() => import('@/pages/Mapa'));
const Rota = lazy(() => import('@/pages/Rota'));
const Beneficios = lazy(() => import('@/pages/Beneficios'));
const Denunciar = lazy(() => import('@/pages/Denunciar'));
const Apresentacao = lazy(() => import('@/pages/Apresentacao'));
const AdminImportar = lazy(() => import('@/pages/AdminImportar'));

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <ConsumerLayout>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center bg-slate-50" role="status">
              <span className="text-sm font-medium text-slate-500">Carregando…</span>
            </div>
          }
        >
          <Switch>
            <Route path="/" component={Mapa} />
            <Route path="/rota" component={Rota} />
            <Route path="/beneficios" component={Beneficios} />
            <Route path="/denunciar" component={Denunciar} />
            <Route path="/apresentacao" component={Apresentacao} />
            <Route path="/admin/importar" component={AdminImportar} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </ConsumerLayout>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LocationProvider>
          <RequireAuthProvider>
            <DenunciaQueueProvider>
              <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                  <Router />
                </WouterRouter>
                <Toaster />
              </TooltipProvider>
            </DenunciaQueueProvider>
          </RequireAuthProvider>
        </LocationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;