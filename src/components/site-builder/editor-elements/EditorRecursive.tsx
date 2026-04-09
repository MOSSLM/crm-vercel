import React from "react";
import type { EditorElement } from "@/types";
import EditorText from "./EditorText";
import EditorContainer from "./EditorContainer";
import EditorVideo from "./EditorVideo";
import EditorLink from "./EditorLink";
import EditorImage from "./EditorImage";
import EditorSection from "./EditorSection";

type Props = { element: EditorElement };

const EditorRecursive = ({ element }: Props) => {
  switch (element.type) {
    case "text":
      return <EditorText element={element} />;
    case "image":
      return <EditorImage element={element} />;
    case "container":
      return <EditorContainer element={element} />;
    case "__body":
      return <EditorContainer element={element} />;
    case "2Col":
      return <EditorContainer element={element} />;
    case "3Col":
      return <EditorContainer element={element} />;
    case "section":
      return <EditorSection element={element} />;
    case "video":
      return <EditorVideo element={element} />;
    case "link":
      return <EditorLink element={element} />;
    default:
      return null;
  }
};

export default EditorRecursive;
