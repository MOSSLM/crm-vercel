import React from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';

export const PageLoadingSkeleton: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 bg-muted rounded animate-pulse"></div>
        <div className="h-4 w-96 bg-muted rounded animate-pulse"></div>
      </div>

      {/* Cards skeleton */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="space-y-2">
              <div className="h-5 w-32 bg-muted rounded animate-pulse"></div>
              <div className="h-4 w-48 bg-muted rounded animate-pulse"></div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-6 w-24 bg-muted rounded animate-pulse"></div>
              <div className="h-4 w-full bg-muted rounded animate-pulse"></div>
              <div className="h-4 w-3/4 bg-muted rounded animate-pulse"></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Large content skeleton */}
      <Card>
        <CardHeader>
          <div className="h-6 w-40 bg-muted rounded animate-pulse"></div>
          <div className="h-4 w-64 bg-muted rounded animate-pulse"></div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-20 bg-muted rounded animate-pulse"></div>
                <div className="h-8 w-16 bg-muted rounded animate-pulse"></div>
                <div className="h-3 w-24 bg-muted rounded animate-pulse"></div>
              </div>
            ))}
          </div>
          <div className="h-64 w-full bg-muted rounded animate-pulse"></div>
        </CardContent>
      </Card>
    </div>
  );
};