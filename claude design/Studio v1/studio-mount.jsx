// studio-mount.jsx — design canvas mount

function StudioApp() {
  return (
    <DesignCanvas>
      <DCSection
        id="hub"
        title="Studio Hub — la nouvelle home"
        subtitle="Click sur le logo S = retour ici. Recherche universelle + tous les outils groupés par étape commerciale."
      >
        <DCArtboard id="hub-home" label="Studio · home" width={1440} height={900}>
          <StudioHub />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="workspace"
        title="Espace métier — navigation à 2 niveaux"
        subtitle="App rail (espaces) + sous-nav (outils de l'espace) + tabs (vues de l'outil). Le pattern flexe : Acquisition, Marketing, Pilotage utilisent la même grille mais hébergent un contenu radicalement différent."
      >
        <DCArtboard id="ws-acq" label="1 · Acquisition · vue d'ensemble" width={1440} height={900}>
          <StudioWorkspace />
        </DCArtboard>
        <DCArtboard id="ws-mkt" label="2 · Marketing & Web · builders comme entités" width={1440} height={900}>
          <StudioMarketing />
        </DCArtboard>
        <DCArtboard id="ws-pil" label="3 · Pilotage · manager view" width={1440} height={900}>
          <StudioPilotage />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="builder"
        title="Outil en focus — Site Builder"
        subtitle="Quand on ouvre un gros builder, level-2 devient le panneau pages/structure et un inspector apparaît à droite. Le rail reste — 1 clic pour sortir, jamais perdu."
      >
        <DCArtboard id="site-builder" label="Site Builder · éditeur d'accueil" width={1440} height={900}>
          <StudioSiteBuilder />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="restyled"
        title="Pages CRM restylées — spec pour Claude Code"
        subtitle="Les vraies pages (Qualification, Pipeline, Opportunités) recadrées dans le shell Studio. Toutes les fonctionnalités du repo MOSSLM/crm-vercel sont préservées : juste un nouveau langage visuel + une meilleure densité d'information."
      >
        <DCArtboard id="qualification" label="Qualification · file du bot (list view)" width={1440} height={1100}>
          <StudioQualification />
        </DCArtboard>
        <DCArtboard id="pipeline" label="Pipeline · kanban multi-étapes" width={1440} height={1000}>
          <StudioPipeline />
        </DCArtboard>
        <DCArtboard id="opportunities" label="Opportunités · grille + bulk + LM status" width={1440} height={1100}>
          <StudioOpportunities />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="focus-modes"
        title="Modes focus — démarchage & cold call"
        subtitle="Quand on enchaîne 30 appels ou 20 InMails, on a besoin d'un mode dédié qui réduit le bruit et structure l'action. 1 file à gauche, 1 contact au centre, contexte à droite."
      >
        <DCArtboard id="demarchage" label="Démarchage · file du jour + script" width={1440} height={1050}>
          <StudioDemarchage />
        </DCArtboard>
        <DCArtboard id="coldcall" label="Cold call workspace · note structurée + KPIs" width={1440} height={1100}>
          <StudioColdCall />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="detail"
        title="Pages détail — opportunité"
        subtitle="Une opp ouverte = tout le contexte (contacts, séquence, notes, lead magnet, RDV à venir) sans modal qui empile. La fiche est une page à part entière."
      >
        <DCArtboard id="opp-detail" label="Opportunité · SARL Dumas BTP (page complète)" width={1440} height={1300}>
          <StudioOpportunityDetail />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="cmdk"
        title="Cmd+K — la vraie cape de super-héros"
        subtitle="Ouvre depuis n'importe où. Recherche contacts, outils, et exécute des actions sans naviguer."
      >
        <DCArtboard id="palette" label="Recherche universelle + actions" width={1440} height={900}>
          <StudioCmdK />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

document.body.classList.remove("mount-pending");
ReactDOM.createRoot(document.getElementById("canvas-root")).render(<StudioApp />);
