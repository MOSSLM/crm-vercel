import React from 'react';
import { NavigationProvider } from './routing/NavigationContext';
import  AppLayout  from './layout/AppLayout';
import { PageRouter } from './routing/PageRouter';

export const AuthenticatedApp: React.FC = () => {
  return (
    <NavigationProvider>
      <AppLayout>
        <PageRouter />
      </AppLayout>
    </NavigationProvider>
  );
};