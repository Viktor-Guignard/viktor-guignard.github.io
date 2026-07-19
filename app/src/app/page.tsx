import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <div className="landing-hero">
        <h1>
          Recherche <em>de CDI</em>
        </h1>
        <p className="muted">Choisis ton espace — chacun a son profil, ses offres et ses candidatures.</p>
      </div>
      <div className="landing-cards">
        <Link href="/elomty" className="landing-card" data-theme="elomty">
          <div className="card-motif" />
          <h2>Elomty</h2>
          <span className="cta">Ouvrir →</span>
        </Link>
        <Link href="/didi" className="landing-card" data-theme="didi">
          <div className="card-motif" />
          <h2>Didi</h2>
          <span className="cta">Ouvrir →</span>
        </Link>
      </div>
    </main>
  );
}
