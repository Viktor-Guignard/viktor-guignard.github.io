export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const next = searchParams.next && searchParams.next.startsWith("/") ? searchParams.next : "/elomty";

  return (
    <div className="login-screen">
      <form className="login-card" method="POST" action="/api/auth/login">
        <h1>Elomty &amp; Didi</h1>
        <p className="muted">Accès privé — recherche de CDI.</p>
        <input type="hidden" name="next" value={next} />
        <label htmlFor="password">Mot de passe</label>
        <input id="password" name="password" type="password" autoFocus required />
        {searchParams.error ? <p className="login-error">Mot de passe incorrect.</p> : null}
        <button type="submit">Entrer</button>
      </form>
    </div>
  );
}
