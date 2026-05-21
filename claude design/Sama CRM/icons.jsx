// icons.jsx — extended lucide-style icon set
const __ICONS = {
  // basic
  plus:      <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  minus:     <line x1="5" y1="12" x2="19" y2="12" />,
  x:         <><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>,
  check:     <polyline points="20 6 9 17 4 12" />,
  chevdown:  <polyline points="6 9 12 15 18 9" />,
  chevright: <polyline points="9 6 15 12 9 18" />,
  chevleft:  <polyline points="15 6 9 12 15 18" />,
  chevup:    <polyline points="6 15 12 9 18 15" />,
  chevsLR:   <><polyline points="15 6 9 12 15 18" /><polyline points="9 6 3 12 9 18" /></>,
  chevsRL:   <><polyline points="9 6 15 12 9 18" /><polyline points="15 6 21 12 15 18" /></>,
  arrowRight:<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
  arrowUp:   <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>,
  arrowDown: <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>,
  search:    <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  more:      <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  moreV:     <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
  drag:      <><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></>,
  trash:     <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></>,
  copy:      <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  eye:       <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></>,
  settings:  <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  share:     <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></>,
  link:      <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" /></>,
  flow:      <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 6h7M18 8.5v7M16 18l-7-7" /></>,
  play:      <polygon points="5 3 19 12 5 21 5 3" />,
  send:      <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
  undo:      <><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></>,
  redo:      <><polyline points="15 14 20 9 15 4" /><path d="M4 20v-7a4 4 0 0 1 4-4h12" /></>,
  // domain
  home:      <><path d="M3 12l9-9 9 9" /><path d="M5 10v10h14V10" /></>,
  kanban:    <><rect x="3" y="3" width="6" height="14" rx="1.2" /><rect x="11" y="3" width="6" height="10" rx="1.2" /><rect x="19" y="3" width="2" height="6" rx="1" /></>,
  bento:     <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="4" rx="1.5" /><rect x="13" y="9" width="8" height="12" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
  building:  <><rect x="4" y="3" width="16" height="18" rx="1" /><line x1="9" y1="8" x2="9" y2="8" /><line x1="15" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="9" y2="16" /><line x1="15" y1="16" x2="15" y2="16" /></>,
  user:      <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  users:     <><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="3" /><path d="M21 19a4 4 0 0 0-5-3.87" /></>,
  calendar:  <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  mail:      <><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></>,
  inbox:     <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  phone:     <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />,
  whatsapp:  <><path d="M20.5 12a8.5 8.5 0 1 1-13.6-6.78L3 21l5.92-1.55A8.5 8.5 0 0 0 20.5 12z" /><path d="M9 9.5c0 4 3.5 7.5 7.5 7.5l1.5-2-3-1-1.2 1c-1.5-.6-2.5-1.6-3.1-3.1l1-1.2-1-3z" /></>,
  linkedin:  <><rect x="2" y="2" width="20" height="20" rx="2" /><line x1="7" y1="10" x2="7" y2="16" /><circle cx="7" cy="7" r=".5" fill="currentColor"/><path d="M11 16v-6M11 13c0-1.7 1.3-3 3-3s3 1.3 3 3v3" /></>,
  pipeline:  <><rect x="3" y="3" width="5" height="18" rx="1.2" /><rect x="10" y="3" width="5" height="12" rx="1.2" /><rect x="17" y="3" width="4" height="7" rx="1.2" /></>,
  target:    <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
  trending:  <><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></>,
  bar:       <><line x1="6" y1="20" x2="6" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="14" /><line x1="3" y1="20" x2="21" y2="20" /></>,
  euro:      <><path d="M19 5a7 7 0 1 0 0 14" /><line x1="3" y1="10" x2="13" y2="10" /><line x1="3" y1="14" x2="13" y2="14" /></>,
  clock:     <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
  bell:      <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  note:      <><path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9" /><path d="M18 2l4 4-10 10H8v-4z" /></>,
  tools:     <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  doc:       <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></>,
  filter:    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,
  globe:     <><circle cx="12" cy="12" r="9" /><line x1="3" y1="12" x2="21" y2="12" /><path d="M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" /></>,
  lock:      <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  refresh:   <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>,
  pin:       <><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14L17 3H7L5 17z" /></>,
  map:       <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></>,
  mappin:    <><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  flame:     <path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-3s-4 2-4 7a7 7 0 1 0 14 0c0-6-7-12-7-12z" />,
  sun:       <><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="6.34" y2="6.34" /><line x1="17.66" y1="17.66" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="6.34" y2="17.66" /><line x1="17.66" y1="6.34" x2="19.07" y2="4.93" /></>,
  droplet:   <path d="M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z" />,
  snow:      <><line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></>,
  zap:       <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  battery:   <><rect x="2" y="7" width="18" height="10" rx="2" /><line x1="22" y1="11" x2="22" y2="13" /><rect x="5" y="10" width="8" height="4" fill="currentColor" stroke="none" /></>,
  panel:     <><rect x="3" y="3" width="18" height="14" rx="1" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="17" /><line x1="15" y1="3" x2="15" y2="17" /><line x1="12" y1="17" x2="12" y2="21" /><line x1="9" y1="21" x2="15" y2="21" /></>,
  windturb:  <><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><path d="M12 10.5V3M13.3 13L20 16M10.7 13L4 16" /></>,
  // misc
  home2:     <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" /></>,
  star:      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  warning:   <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></>,
  info:      <><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12" y2="16" /></>,
  google:    <path d="M12 11v3.5h5.4c-.2 1.2-1.6 3.5-5.4 3.5-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4 9.6-9.7 0-.7-.1-1.2-.2-1.8L12 11z" stroke="none" fill="currentColor" />,
  microsoft: <><rect x="2" y="2" width="9" height="9" fill="currentColor" stroke="none" /><rect x="13" y="2" width="9" height="9" fill="currentColor" stroke="none" /><rect x="2" y="13" width="9" height="9" fill="currentColor" stroke="none" /><rect x="13" y="13" width="9" height="9" fill="currentColor" stroke="none" /></>,
  layoutGrid:<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  layoutList:<><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  download:  <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  print:     <><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
  ext:       <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
  flag:      <><line x1="4" y1="22" x2="4" y2="15" /><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /></>,
  flash:     <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  attach:    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  square:    <rect x="4" y="4" width="16" height="16" rx="2" />,
  squareCheck:<><rect x="4" y="4" width="16" height="16" rx="2" /><polyline points="9 12 11 14 16 9" /></>,
  hash:      <><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  branch:    <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><circle cx="6" cy="18" r="2" /><path d="M6 8v8" /><path d="M8 6h6a4 4 0 0 1 4 4v6" /></>,
};

function Icon({ name, className = "ico", strokeWidth, ...rest }) {
  const path = __ICONS[name];
  if (!path) return <span style={{ display: "inline-block", width: 14, height: 14 }} />;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={strokeWidth || 1.6} strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" {...rest}>
      {path}
    </svg>
  );
}

window.Icon = Icon;
