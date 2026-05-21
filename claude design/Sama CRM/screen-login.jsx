// screen-login.jsx
function ScreenLogin({ onSignIn }) {
  const [email, setEmail] = React.useState("lucas@thermalis.fr");
  const [pwd, setPwd] = React.useState("••••••••••");

  return (
    <div className="login-host">
      <div className="login-left">
        <div className="top">
          <div className="brand-mark">S</div>
          <div>
            <div className="nm">Sama CRM</div>
            <div className="org">thermalis.workspace</div>
          </div>
        </div>

        <div className="form-wrap">
          <h1>Bienvenue de retour.</h1>
          <p className="lead">
            Sept rendez-vous t'attendent cette semaine. Trois devis à relancer. Une PAC à signer ce matin.
          </p>

          <form className="login-form" onSubmit={(e) => { e.preventDefault(); onSignIn?.(); }}>
            <div className="field">
              <div className="lb">Email</div>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <div className="lb">
                <span>Mot de passe</span>
                <a href="#">Oublié ?</a>
              </div>
              <input className="input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
            </div>

            <button className="submit" type="submit">
              Entrer dans le CRM
              <Icon name="arrowRight" className="ico arr" />
            </button>

            <div className="or">ou</div>

            <div className="login-sso">
              <div className="b"><Icon name="google" className="ico" /> Google</div>
              <div className="b"><Icon name="microsoft" className="ico" /> Microsoft</div>
            </div>
          </form>
        </div>

        <div className="bottom">
          <span>© 2026 Sama · Thermalis SAS</span>
          <span>v2.4.1 · build 8c056b8</span>
        </div>
      </div>

      <div className="login-right">
        <div className="deco-grid" />

        <div className="stage-tag">Production · sama.thermalis.fr</div>

        <div className="quote">
          « En 4 mois, on a divisé par 2 le temps entre un devis envoyé et la signature. <em>Sama m'a rendu mes soirées.</em> »
        </div>
        <div className="author">
          <span className="av">CP</span>
          <span><strong style={{ color: "var(--bg)" }}>Camille Pelletier</strong> · Dirigeante, Énergie Solaire 49</span>
        </div>

        <div className="demo">
          <div className="ttl">Activité workspace · live</div>
          <div className="stats">
            <div className="stat">
              <div className="v">142</div>
              <div className="l">RDV ce mois</div>
            </div>
            <div className="stat">
              <div className="v">38<small style={{ fontSize: 14, opacity: .55 }}> %</small></div>
              <div className="l">Taux conversion</div>
            </div>
            <div className="stat">
              <div className="v">412<small style={{ fontSize: 14, opacity: .55 }}>k€</small></div>
              <div className="l">Pipeline ouvert</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.ScreenLogin = ScreenLogin;
