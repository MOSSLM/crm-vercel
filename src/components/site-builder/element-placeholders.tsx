import React from "react";
import {
  Type,
  Image,
  Video,
  Link2,
  Layout,
  Square,
  Columns2,
  Columns3,
} from "lucide-react";
import type { EditorBtns } from "@/types";

type ComponentElement = {
  placeholder: React.ReactNode;
  label: string;
  id: EditorBtns;
  group: "layout" | "elements";
};

const PlaceholderBox = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
  <div className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 p-3 hover:bg-muted cursor-grab active:cursor-grabbing w-full aspect-video">
    <Icon className="h-5 w-5 text-muted-foreground" />
    <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
  </div>
);

export const ELEMENT_LAYOUT_PLACEHOLDERS: ComponentElement[] = [
  {
    placeholder: <PlaceholderBox icon={Layout} label="Section" />,
    label: "Section",
    id: "section",
    group: "layout",
  },
  {
    placeholder: <PlaceholderBox icon={Square} label="Container" />,
    label: "Container",
    id: "container",
    group: "layout",
  },
  {
    placeholder: <PlaceholderBox icon={Columns2} label="2 Colonnes" />,
    label: "2 Colonnes",
    id: "2Col",
    group: "layout",
  },
  {
    placeholder: <PlaceholderBox icon={Columns3} label="3 Colonnes" />,
    label: "3 Colonnes",
    id: "3Col",
    group: "layout",
  },
];

export const ELEMENT_PRIMITIVE_PLACEHOLDERS: ComponentElement[] = [
  {
    placeholder: <PlaceholderBox icon={Type} label="Texte" />,
    label: "Texte",
    id: "text",
    group: "elements",
  },
  {
    placeholder: <PlaceholderBox icon={Image} label="Image" />,
    label: "Image",
    id: "image",
    group: "elements",
  },
  {
    placeholder: <PlaceholderBox icon={Video} label="Vidéo" />,
    label: "Vidéo",
    id: "video",
    group: "elements",
  },
  {
    placeholder: <PlaceholderBox icon={Link2} label="Lien" />,
    label: "Lien",
    id: "link",
    group: "elements",
  },
];
