"use client";

import React from "react";
import type {
  EditorAction,
  EditorElement,
  EditorState,
  HistoryState,
  SitePage,
} from "@/types";

const initialEditorState: EditorState["editor"] = {
  device: "Desktop",
  previewMode: false,
  liveMode: false,
  elements: [
    {
      content: [],
      id: "__body",
      name: "Body",
      styles: {},
      type: "__body",
    },
  ],
  selectedElement: {
    id: "",
    content: [],
    name: "",
    styles: {},
    type: null,
  },
  pageId: "",
};

const initialHistoryState: HistoryState = {
  currentIndex: 0,
  history: [initialEditorState],
};

const initialState: EditorState = {
  editor: initialEditorState,
  history: initialHistoryState,
};

const addElement = (elements: EditorElement[], action: EditorAction): EditorElement[] => {
  if (action.type !== "ADD_ELEMENT") throw Error("Wrong action type for Add Element");

  return elements.map((element) => {
    if (element.id === action.payload.containerId && Array.isArray(element.content)) {
      return { ...element, content: [...element.content, action.payload.elementDetails] };
    } else if (element.content && Array.isArray(element.content)) {
      return { ...element, content: addElement(element.content, action) };
    }
    return element;
  });
};

const updateElement = (elements: EditorElement[], action: EditorAction): EditorElement[] => {
  if (action.type !== "UPDATE_ELEMENT") throw Error("Wrong action type for Update Element");

  return elements.map((element) => {
    if (element.id === action.payload.elementDetails.id) {
      return { ...element, ...action.payload.elementDetails };
    } else if (element.content && Array.isArray(element.content)) {
      return { ...element, content: updateElement(element.content, action) };
    }
    return element;
  });
};

const moveElement = (
  elements: EditorElement[],
  elementId: string,
  targetContainerId: string,
  position: "inside" | "before" | "after" = "inside"
): EditorElement[] => {
  // Step 1: extract the element being moved
  let moved: EditorElement | null = null;
  const extract = (els: EditorElement[]): EditorElement[] =>
    els.reduce<EditorElement[]>((acc, el) => {
      if (el.id === elementId) { moved = el; return acc; }
      if (Array.isArray(el.content)) return [...acc, { ...el, content: extract(el.content) }];
      return [...acc, el];
    }, []);
  const afterExtract = extract(elements);
  if (!moved) return elements;

  const insertRelative = (els: EditorElement[]): EditorElement[] => {
    const targetIndex = els.findIndex((el) => el.id === targetContainerId);
    if (targetIndex !== -1 && (position === "before" || position === "after")) {
      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      const next = [...els];
      next.splice(insertIndex, 0, moved!);
      return next;
    }

    return els.map((el) => {
      if (position === "inside" && el.id === targetContainerId && Array.isArray(el.content)) {
        return { ...el, content: [...el.content, moved!] };
      }

      if (Array.isArray(el.content)) {
        return { ...el, content: insertRelative(el.content) };
      }
      return el;
    });
  };

  return insertRelative(afterExtract);
};

const deleteElement = (elements: EditorElement[], action: EditorAction): EditorElement[] => {
  if (action.type !== "DELETE_ELEMENT") throw Error("Wrong action type for Delete Element");

  return elements.filter((element) => {
    if (element.id === action.payload.elementDetails.id) return false;
    if (element.content && Array.isArray(element.content)) {
      element.content = deleteElement(element.content, action);
    }
    return true;
  });
};

const editorReducer = (state: EditorState = initialState, action: EditorAction): EditorState => {
  switch (action.type) {
    case "ADD_ELEMENT": {
      const updatedEditor = { ...state.editor, elements: addElement(state.editor.elements, action) };
      const updatedHistory = [...state.history.history.slice(0, state.history.currentIndex + 1), { ...updatedEditor }];
      return { ...state, editor: updatedEditor, history: { ...state.history, history: updatedHistory, currentIndex: updatedHistory.length - 1 } };
    }
    case "UPDATE_ELEMENT": {
      const updatedElements = updateElement(state.editor.elements, action);
      const isSelected = state.editor.selectedElement.id === action.payload.elementDetails.id;
      const updatedEditor = {
        ...state.editor,
        elements: updatedElements,
        selectedElement: isSelected ? action.payload.elementDetails : { id: "", content: [], name: "", styles: {}, type: null as null },
      };
      const updatedHistory = [...state.history.history.slice(0, state.history.currentIndex + 1), { ...updatedEditor }];
      return { ...state, editor: updatedEditor, history: { ...state.history, history: updatedHistory, currentIndex: updatedHistory.length - 1 } };
    }
    case "DELETE_ELEMENT": {
      const updatedEditor = { ...state.editor, elements: deleteElement(state.editor.elements, action) };
      const updatedHistory = [...state.history.history.slice(0, state.history.currentIndex + 1), { ...updatedEditor }];
      return { ...state, editor: updatedEditor, history: { ...state.history, history: updatedHistory, currentIndex: updatedHistory.length - 1 } };
    }
    case "CHANGE_CLICKED_ELEMENT":
      return {
        ...state,
        editor: {
          ...state.editor,
          selectedElement: action.payload.elementDetails || { id: "", content: [], name: "", styles: {}, type: null as null },
        },
      };
    case "CHANGE_DEVICE":
      return { ...state, editor: { ...state.editor, device: action.payload.device } };
    case "TOGGLE_PREVIEW_MODE":
      return { ...state, editor: { ...state.editor, previewMode: !state.editor.previewMode } };
    case "TOGGLE_LIVE_MODE":
      return { ...state, editor: { ...state.editor, liveMode: action.payload ? action.payload.value : !state.editor.liveMode } };
    case "CLEAR_HISTORY":
      return { ...state, history: { ...state.history, history: [], currentIndex: 0 } };
    case "REDO": {
      if (state.history.currentIndex < state.history.history.length - 1) {
        const nextIndex = state.history.currentIndex + 1;
        return { ...state, editor: { ...state.history.history[nextIndex] }, history: { ...state.history, currentIndex: nextIndex } };
      }
      return state;
    }
    case "UNDO": {
      if (state.history.currentIndex > 0) {
        const prevIndex = state.history.currentIndex - 1;
        return { ...state, editor: { ...state.history.history[prevIndex] }, history: { ...state.history, currentIndex: prevIndex } };
      }
      return state;
    }
    case "LOAD_DATA": {
      const parsed = action.payload.elements;
      const elements = (Array.isArray(parsed) && parsed.length > 0) ? parsed : initialEditorState.elements;
      return {
        ...initialState,
        editor: {
          ...initialState.editor,
          elements,
          liveMode: !!action.payload.withLive,
        },
      };
    }
    case "SET_PAGE_ID":
      return { ...state, editor: { ...state.editor, pageId: action.payload.pageId } };
    case "MOVE_ELEMENT": {
      const updatedElements = moveElement(
        state.editor.elements,
        action.payload.elementId,
        action.payload.targetContainerId,
        action.payload.position
      );
      const updatedEditor = { ...state.editor, elements: updatedElements };
      const updatedHistory = [...state.history.history.slice(0, state.history.currentIndex + 1), { ...updatedEditor }];
      return { ...state, editor: updatedEditor, history: { ...state.history, history: updatedHistory, currentIndex: updatedHistory.length - 1 } };
    }
    default:
      return state;
  }
};

export type EditorContextData = {
  editor: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  siteId: string;
  pageDetails: SitePage | null;
};

export const EditorContext = React.createContext<EditorContextData>({
  editor: initialState,
  dispatch: () => undefined,
  siteId: "",
  pageDetails: null,
});

type EditorProviderProps = {
  children: React.ReactNode;
  siteId: string;
  pageDetails: SitePage;
};

const EditorProvider: React.FC<EditorProviderProps> = ({ children, siteId, pageDetails }) => {
  const [editor, dispatch] = React.useReducer(editorReducer, initialState);

  return (
    <EditorContext.Provider value={{ editor, dispatch, siteId, pageDetails }}>
      {children}
    </EditorContext.Provider>
  );
};

export default EditorProvider;
