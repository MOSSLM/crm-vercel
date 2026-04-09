"use client";

import React from "react";
import { EditorContext, type EditorContextData } from "./EditorProvider";

export const useEditor = (): EditorContextData => {
  const context = React.useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return context;
};
