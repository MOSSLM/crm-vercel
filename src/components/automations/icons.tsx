// icons.tsx — jeu d'icônes « XI » porté depuis claude design/automations-icons.jsx.
import React from 'react'

const ICONS: Record<string, React.ReactNode> = {
  // channels
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></>,
  mailOpen: <><path d="M3 9l9 6 9-6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" /><path d="M3 9l9-6 9 6" /></>,
  whatsapp: <><path d="M20 12a8 8 0 0 1-12.4 6.7L3 20l1.4-4.5A8 8 0 1 1 20 12z" /><path d="M9 9c.3-.8 1-1.4 1.8-1.4.5 0 .9.2 1.2.6.3.4.4.9.2 1.4l-.4 1c-.1.3 0 .6.3.8l1.7 1.2c.3.2.7.2 1-.1l.7-.6c.4-.4 1-.4 1.4 0 .4.4.6 1 .4 1.5-.4 1.1-1.4 1.9-2.6 1.9C9.6 16.4 7 13 7 10c0-.4 0-.7.1-1" /></>,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="7" y1="10" x2="7" y2="17" /><circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" /><path d="M11 17v-7" /><path d="M11 12c0-1.5 1-2 2-2s2 .5 2 2v5" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />,
  phoneOut: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" /><polyline points="16 3 21 3 21 8" /><line x1="14" y1="10" x2="21" y2="3" /></>,
  sms: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /><line x1="8" y1="11" x2="8" y2="11" /><line x1="12" y1="11" x2="12" y2="11" /><line x1="16" y1="11" x2="16" y2="11" /></>,
  // flow / nodes
  bolt: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  branch: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><circle cx="6" cy="18" r="2" /><path d="M6 8v8" /><path d="M8 6h6a4 4 0 0 1 4 4v6" /></>,
  flag: <><line x1="4" y1="22" x2="4" y2="4" /><path d="M4 4h13l-2.5 4L17 12H4" /></>,
  filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,
  splitH: <><line x1="4" y1="12" x2="20" y2="12" /><polyline points="9 7 4 12 9 17" /><polyline points="15 7 20 12 15 17" /></>,
  randomize: <><line x1="3" y1="3" x2="21" y2="21" /><line x1="3" y1="21" x2="21" y2="3" /><polyline points="14 4 21 4 21 11" /><polyline points="10 20 3 20 3 13" /></>,
  // database / supabase
  database: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5" /><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6" /></>,
  table: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /></>,
  pipeline: <><circle cx="5" cy="12" r="3" /><circle cx="19" cy="12" r="3" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="9" x2="13" y2="9" /><line x1="11" y1="15" x2="13" y2="15" /></>,
  kanban: <><rect x="3" y="3" width="6" height="14" rx="1" /><rect x="11" y="3" width="6" height="10" rx="1" /><rect x="19" y="3" width="2" height="6" rx="1" /></>,
  contacts: <><circle cx="9" cy="9" r="3.5" /><path d="M3 21a6 6 0 0 1 12 0" /><circle cx="17" cy="7" r="2.5" /><path d="M14.5 14a4.5 4.5 0 0 1 7 4" /></>,
  company: <><rect x="4" y="3" width="16" height="18" rx="1" /><line x1="9" y1="8" x2="9" y2="8" /><line x1="15" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="15" y2="12" /></>,
  opportunity: <><circle cx="12" cy="8" r="6" /><polyline points="8.5 11 12 14 15.5 11" /><line x1="12" y1="2" x2="12" y2="14" /><path d="M8 17l-2 4h12l-2-4" /></>,
  tag: <><path d="M20 12V4a2 2 0 0 0-2-2h-8L2 10l10 10 8-8z" /><circle cx="8" cy="8" r="1.5" /></>,
  doc: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
  form: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="7" y1="9" x2="13" y2="9" /><line x1="7" y1="13" x2="17" y2="13" /><line x1="7" y1="17" x2="11" y2="17" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  webhook: <><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><circle cx="12" cy="5" r="3" /><path d="M9 18h6" /><path d="M10.6 7.5l-3 5.5" /><path d="M13.4 7.5l3 5.5" /></>,
  // states / actions
  pause: <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>,
  playFill: <polygon points="6 4 20 12 6 20 6 4" />,
  history: <><polyline points="3 3 3 9 9 9" /><path d="M3 9a9 9 0 1 0 3-6.7L3 5" /><polyline points="12 7 12 12 15 14" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><circle cx="17" cy="6" r="3" /><path d="M18 14a5 5 0 0 1 5 5" /></>,
  star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  flame: <path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-3s-4 2-4 7a7 7 0 1 0 14 0c0-6-7-12-7-12z" />,
  list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  template: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  ai: <><path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>,
  arrow: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
  cal: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  euro: <><path d="M19 5a7 7 0 1 0 0 14" /><line x1="3" y1="10" x2="13" y2="10" /><line x1="3" y1="14" x2="13" y2="14" /></>,
  filterX: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /><line x1="13" y1="8" x2="19" y2="14" /><line x1="19" y1="8" x2="13" y2="14" /></>,
  task: <><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="8 12 11 15 16 9" /></>,
  copyClip: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  refresh: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>,
  power: <><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></>,
  sparkle: <><path d="M12 3l1.5 4 4 1.5-4 1.5L12 14l-1.5-4-4-1.5 4-1.5z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>,
  snooze: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5h5l-5 5h5" /></>,
  skip: <><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></>,
  variable: <><circle cx="12" cy="12" r="9" /><path d="M8 9c2 0 2 6 4 6M16 9c-2 0-2 6-4 6" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1" /><line x1="9" y1="8" x2="9" y2="8" /><line x1="15" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="15" y2="12" /></>,
  inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></>,
  edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><line x1="3" y1="12" x2="21" y2="12" /><path d="M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  warning: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></>,
  more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  grip: <><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  checkBig: <><circle cx="12" cy="12" r="10" /><polyline points="16 9 11 15 8 12" /></>,
  send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
  x: <><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>,
  chevdown: <polyline points="6 9 12 15 18 9" />,
  chevright: <polyline points="9 6 15 12 9 18" />,
  chevleft: <polyline points="15 6 9 12 15 18" />,
  chevup: <polyline points="6 15 12 9 18 15" />,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  undo: <><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></>,
  redo: <><polyline points="15 14 20 9 15 4" /><path d="M4 20v-7a4 4 0 0 1 4-4h12" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  pin: <><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14V13l-2-2v-5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v5l-2 2v4z" /></>,
  archive: <><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></>,
  play: <polygon points="5 3 19 12 5 21 5 3" />,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  cursor: <path d="M3 3l7.07 17 2.51-7.39 7.39-2.51L3 3z" />,
  mouse: <><rect x="6" y="3" width="12" height="18" rx="6" /><line x1="12" y1="7" x2="12" y2="11" /></>,
}

export type IconName = keyof typeof ICONS | string

export function XI({
  name,
  className = 'ico',
  strokeWidth,
  ...rest
}: { name: string; className?: string; strokeWidth?: number } & React.SVGProps<SVGSVGElement>) {
  const path = ICONS[name] ?? ICONS.bolt
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {path}
    </svg>
  )
}
