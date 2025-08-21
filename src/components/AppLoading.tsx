"use client";
import React from "react";

export default function AppLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary border-t-transparent mx-auto"></div>
        <div className="space-y-2">
          <h2>Chargement de l'application</h2>
          <p className="text-muted-foreground">Veuillez patienter...</p>
        </div>
      </div>
    </div>
  );
}
