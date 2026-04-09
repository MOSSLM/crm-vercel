import { defaultStyles } from "./editor.config";
import type { EditorAction, EditorBtns, EditorElement } from "@/types";

/** Recursively replace all element IDs with fresh UUIDs (for instantiating saved components). */
export function reinstantiateWithNewIds(element: EditorElement): EditorElement {
  return {
    ...element,
    id: crypto.randomUUID(),
    content: Array.isArray(element.content)
      ? element.content.map(reinstantiateWithNewIds)
      : element.content,
  };
}

export const addVerifyElement = (
  componentType: EditorBtns,
  containerId: string,
  dispatch: (value: EditorAction) => void
) => {
  switch (componentType) {
    case "text": {
      dispatch({
        type: "ADD_ELEMENT",
        payload: {
          containerId,
          elementDetails: {
            content: { innerText: "Text Element" },
            id: crypto.randomUUID(),
            name: "Text",
            type: "text",
            styles: { color: "black", ...defaultStyles },
          },
        },
      });
      break;
    }
    case "image": {
      dispatch({
        type: "ADD_ELEMENT",
        payload: {
          containerId,
          elementDetails: {
            content: {
              src: "https://cdn.pixabay.com/photo/2016/05/05/02/37/sunset-1373171_1280.jpg",
              alt: "Image description",
            },
            id: crypto.randomUUID(),
            name: "Image",
            type: "image",
            styles: { color: "black", width: "1000px", height: "600px", aspectRatio: "1/1", marginLeft: "auto", marginRight: "auto", ...defaultStyles },
          },
        },
      });
      break;
    }
    case "section": {
      dispatch({
        type: "ADD_ELEMENT",
        payload: {
          containerId,
          elementDetails: {
            content: [
              {
                content: [],
                id: crypto.randomUUID(),
                name: "Container",
                styles: { ...defaultStyles, width: "100%" },
                type: "container",
              },
            ],
            id: crypto.randomUUID(),
            name: "Section",
            type: "section",
            styles: { ...defaultStyles },
          },
        },
      });
      break;
    }
    case "container": {
      dispatch({
        type: "ADD_ELEMENT",
        payload: {
          containerId,
          elementDetails: {
            content: [],
            id: crypto.randomUUID(),
            name: "Container",
            type: "container",
            styles: { ...defaultStyles },
          },
        },
      });
      break;
    }
    case "link": {
      dispatch({
        type: "ADD_ELEMENT",
        payload: {
          containerId,
          elementDetails: {
            content: { innerText: "Link Element", href: "#" },
            id: crypto.randomUUID(),
            name: "Link",
            styles: { color: "black", ...defaultStyles },
            type: "link",
          },
        },
      });
      break;
    }
    case "video": {
      dispatch({
        type: "ADD_ELEMENT",
        payload: {
          containerId,
          elementDetails: {
            content: { src: "https://www.youtube.com/embed/so1_VXaGqmM?si=2lBxVOuA57XMv0JX" },
            id: crypto.randomUUID(),
            name: "Video",
            styles: {},
            type: "video",
          },
        },
      });
      break;
    }
    case "2Col": {
      dispatch({
        type: "ADD_ELEMENT",
        payload: {
          containerId,
          elementDetails: {
            content: [
              { content: [], id: crypto.randomUUID(), name: "Container", styles: { ...defaultStyles, width: "100%" }, type: "container" },
              { content: [], id: crypto.randomUUID(), name: "Container", styles: { ...defaultStyles, width: "100%" }, type: "container" },
            ],
            id: crypto.randomUUID(),
            name: "Two Columns",
            styles: { ...defaultStyles, display: "flex" },
            type: "2Col",
          },
        },
      });
      break;
    }
    case "3Col": {
      dispatch({
        type: "ADD_ELEMENT",
        payload: {
          containerId,
          elementDetails: {
            content: [
              { content: [], id: crypto.randomUUID(), name: "Container", styles: { ...defaultStyles, width: "100%" }, type: "container" },
              { content: [], id: crypto.randomUUID(), name: "Container", styles: { ...defaultStyles, width: "100%" }, type: "container" },
              { content: [], id: crypto.randomUUID(), name: "Container", styles: { ...defaultStyles, width: "100%" }, type: "container" },
            ],
            id: crypto.randomUUID(),
            name: "Three Columns",
            styles: { ...defaultStyles, display: "flex" },
            type: "3Col",
          },
        },
      });
      break;
    }
  }
};
