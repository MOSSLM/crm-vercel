"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Loader2, Save, WrapText } from "lucide-react";
import { Button } from "@/components/ui/button";
// eslint-disable-next-line @typescript-eslint/no-require-imports
type IStandaloneCodeEditor = import("monaco-editor").editor.IStandaloneCodeEditor;
// Monaco instance type (used only at runtime via onMount)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonacoInstance = any;

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  { ssr: false, loading: () => <EditorSkeleton /> }
);

interface Props {
  code: string;
  onChange: (code: string) => void;
  onSave: () => void;
  saving: boolean;
  unsaved: boolean;
  sectionId: string | null;
}

export default function SectionEditor({
  code,
  onChange,
  onSave,
  saving,
  unsaved,
  sectionId,
}: Props) {
  const editorRef = React.useRef<IStandaloneCodeEditor | null>(null);

  const handleMount = (editorInstance: IStandaloneCodeEditor, monaco: MonacoInstance) => {
    editorRef.current = editorInstance;

    // Ctrl+S / Cmd+S to save
    editorInstance.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      onSave
    );

    // TypeScript + JSX config
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: "React",
      allowJs: true,
      typeRoots: ["node_modules/@types"],
    });

    // Inject type definitions for props
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `
declare module 'react' {
  export = React;
  export as namespace React;
}
declare namespace React {
  function createElement(type: any, props?: any, ...children: any[]): any;
  function useState<T>(init: T): [T, (v: T) => void];
  function useEffect(fn: () => void | (() => void), deps?: any[]): void;
  function useRef<T>(init: T): { current: T };
  function useCallback<T extends (...args: any[]) => any>(fn: T, deps: any[]): T;
  function useMemo<T>(fn: () => T, deps: any[]): T;
  const Fragment: any;
  type ReactNode = any;
  type FC<P = {}> = (props: P) => any;
}

interface SectionProps {
  /** Design tokens du thème (couleurs, polices…) */
  tokens?: Record<string, string>;
  /** Données dynamiques de la section */
  data?: Record<string, unknown>;
  /** Variables entreprise ex: variables['entreprise.nom'] */
  variables?: Record<string, string>;
}

/** Variables entreprise disponibles */
declare const ENTERPRISE_VARIABLES: {
  nom: string;
  telephone: string;
  email: string;
  adresse: string;
  ville: string;
  code_postal: string;
  logo_url: string;
  site_web_canonique: string;
  note_moyenne: string;
  nombre_avis: string;
  description: string;
  annee_creation: string;
};
`,
      "ts:section-types.d.ts"
    );

    // Word wrap toggle shortcut Alt+Z
    editorInstance.addCommand(
      monaco.KeyMod.Alt | monaco.KeyCode.KeyZ,
      () => {
        const current = editorInstance.getOption(
          monaco.editor.EditorOption.wordWrap
        );
        editorInstance.updateOptions({
          wordWrap: current === "on" ? "off" : "on",
        });
      }
    );
  };

  const handleFormat = () => {
    editorRef.current?.getAction("editor.action.formatDocument")?.run();
  };

  if (!sectionId) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-zinc-950 text-zinc-600">
        <p className="text-sm">Sélectionnez une section pour l'éditer</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 flex-shrink-0">
        <span className="font-mono text-xs text-zinc-400 flex-1 truncate">
          {sectionId}.tsx
          {unsaved && (
            <span className="ml-2 text-orange-400" title="Modifications non sauvegardées">
              ●
            </span>
          )}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs text-zinc-400 hover:text-white px-2"
          onClick={handleFormat}
          title="Formater (Prettier)"
        >
          <WrapText className="h-3 w-3 mr-1" />
          Formater
        </Button>
        <Button
          size="sm"
          className={`h-6 text-xs px-2 ${
            unsaved
              ? "bg-orange-600 hover:bg-orange-700 text-white"
              : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
          }`}
          onClick={onSave}
          disabled={saving || !unsaved}
          title="Sauvegarder (Ctrl+S)"
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Save className="h-3 w-3 mr-1" />
          )}
          {saving ? "Sauvegarde…" : "Sauvegarder"}
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language="typescript"
          value={code}
          onChange={(v) => onChange(v ?? "")}
          onMount={handleMount}
          path={`section://${sectionId}.tsx`}
          theme="vs-dark"
          options={{
            fontSize: 13,
            lineHeight: 20,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            insertSpaces: true,
            formatOnPaste: true,
            formatOnType: false,
            suggestOnTriggerCharacters: true,
            quickSuggestions: { other: true, comments: false, strings: true },
            bracketPairColorization: { enabled: true },
            renderLineHighlight: "gutter",
            padding: { top: 8, bottom: 8 },
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
            },
          }}
        />
      </div>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex items-center justify-center h-full bg-zinc-950">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
    </div>
  );
}
