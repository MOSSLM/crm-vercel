import React from 'react';
import { AuthProvider, useAuth } from './components/AuthContext';
import { AppDataProvider } from './components/AppDataContext';
import { ThemeProvider } from './components/ThemeContext';
import { LoginPage } from './components/LoginPage';
import { AppLoading } from './components/AppLoading';

// Import direct de l'app authentifiée pour éviter les erreurs de lazy loading
import { AuthenticatedApp } from './components/AuthenticatedApp';

const AppContent: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <AppLoading />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <AuthenticatedApp />;
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppDataProvider>
          <AppContent />
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}