// screen-login.jsx — connexion agent freelance SAMA
function ScreenLogin({ onSignIn }) {
  const [email, setEmail] = React.useState("naima.cherif@freelance.sama.fr");
  const [pwd, setPwd] = React.useState("••••••••••");

  return (
    <div className="login-host">
      <div className="login-left">
        <div className="top">
          <div className="brand-mark">S</div>
          <div>
            <div className="nm">SAMA</div>
            <div className="org">réseau freelance</div>
          </div>
        </div>

        <div className="form-wrap">
          <h1>Bonjour Naïma.</h1>
          <p className="lead">
            9 actions t'attendent aujourd'hui. 2 RDV à confirmer pour tes mandants CVC, et un lead chaud qui vient d'ouvrir ton devis.
          </p>

          <form className="login-form" onSubmit={(e) => { e.preventDefault(); onSignIn?.(); }}>
            <div className="field">
              <div className="lb">Email</div>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <div className="lb"><span>Mot de passe</span><a href="#">Oublié ?</a></div>
              <input className="input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
            </div>
            <button className="submit" type="submit">Accéder à mon espace<Icon name="arrowRight" className="ico arr" /></button>
            <div className="or">ou</div>
            <div className="login-sso">
              <div className="b"><Icon name="google" className="ico" /> Google</div>
              <div className="b"><Icon name="microsoft" className="ico" /> Microsoft</div>
            </div>
          </form>
        </div>

        <div className="bottom">
          <span>© 2026 SAMA · réseau d'agents</span>
          <span>v2.4.1 · build 8c056b8</span>
        </div>
      </div>

      <div className="login-right">
        <div className="deco-grid" />
        <div className="stage-tag">Espace agent · app.sama.fr</div>
        <div className="quote">
          « Je bosse pour 5 installateurs CVC depuis chez moi. SAMA me file les leads, je décroche les RDV. <em>Payée au résultat, libre de mon agenda.</em> »
        </div>
        <div className="author">
          <span className="av">NC</span>
          <span><strong style={{ color: "var(--bg)" }}>Naïma Cherif</strong> · agent freelance SAMA</span>
        </div>
        <div className="demo">
          <div className="ttl">Mon mois · live</div>
          <div className="stats">
            <div className="stat"><div className="v">23</div><div className="l">RDV pris</div></div>
            <div className="stat"><div className="v">42<small style={{ fontSize: 14, opacity: .55 }}> %</small></div><div className="l">Taux réponse</div></div>
            <div className="stat"><div className="v">1 8<small style={{ fontSize: 14, opacity: .55 }}>40€</small></div><div className="l">Commissions</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.ScreenLogin = ScreenLogin;
