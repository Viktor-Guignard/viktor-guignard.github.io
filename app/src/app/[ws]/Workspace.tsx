"use client";

import { useState } from "react";
import Link from "next/link";
import type { Workspace } from "@/lib/auth";

type Profile = {
  workspace: string;
  poste: string;
  localisation: string;
  experience: string;
  secteurs: string;
};

type Settings = {
  franceTravailClientId: string;
  franceTravailSecretSet: boolean;
  adzunaAppId: string;
  adzunaAppKeySet: boolean;
  googleCseId: string;
  googleCseKeySet: boolean;
  hunterApiKeySet: boolean;
  gmailAddress: string;
};

type Offer = {
  id: string;
  titre: string;
  entreprise: string;
  lieu: string;
  contact: string | null;
  exigences: string;
  source: string;
  url: string | null;
  altStage: boolean;
  contactGuessed?: boolean;
  selected: boolean;
};

type Tab = "recherche" | "candidatures" | "reglages";

export default function Workspace_({
  ws,
  label,
  initialProfile,
  initialSettings,
  initialOffers,
}: {
  ws: Workspace;
  label: { name: string };
  initialProfile: Profile;
  initialSettings: Settings;
  initialOffers: Offer[];
}) {
  const [tab, setTab] = useState<Tab>("recherche");
  const [profile, setProfile] = useState(initialProfile);
  const [settings, setSettings] = useState(initialSettings);
  const [secretInputs, setSecretInputs] = useState({
    franceTravailSecret: "",
    adzunaAppKey: "",
    googleCseKey: "",
    hunterApiKey: "",
  });
  const [offers, setOffers] = useState(initialOffers);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [searching, setSearching] = useState(false);
  const [cdiCddOnly, setCdiCddOnly] = useState(true);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const linkedinUrl =
    "https://www.linkedin.com/jobs/search/?keywords=" +
    encodeURIComponent(profile.poste || label.name) +
    "&f_JT=F";

  async function saveProfile() {
    setSavingProfile(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/workspaces/${ws}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error("Échec de l'enregistrement du profil.");
      setMessage({ type: "success", text: "Profil enregistré." });
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/workspaces/${ws}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, ...secretInputs }),
      });
      if (!res.ok) throw new Error("Échec de l'enregistrement des réglages.");
      const updated = await fetch(`/api/workspaces/${ws}/settings`).then((r) => r.json());
      setSettings(updated);
      setSecretInputs({ franceTravailSecret: "", adzunaAppKey: "", googleCseKey: "", hunterApiKey: "" });
      setMessage({ type: "success", text: "Réglages enregistrés." });
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setSavingSettings(false);
    }
  }

  async function runSearch() {
    setSearching(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/workspaces/${ws}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cdiCddOnly }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec de la recherche.");
      setOffers(data.offers);
      if (data.errors?.length) {
        setMessage({
          type: "error",
          text: `${data.foundCount} offre(s) trouvée(s). Sources en erreur : ${data.errors.join(" · ")}`,
        });
      } else {
        setMessage({ type: "success", text: `${data.foundCount} offre(s) trouvée(s).` });
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setSearching(false);
    }
  }

  async function toggleOffer(id: string, selected: boolean) {
    setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, selected } : o)));
    await fetch(`/api/workspaces/${ws}/offers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected }),
    });
  }

  // Le toggle CDI/CDD filtre l'affichage immédiatement, sans re-lancer de recherche.
  const visibleOffers = cdiCddOnly ? offers.filter((o) => !o.altStage) : offers;
  const withEmail = visibleOffers.filter((o) => o.contact);
  const withoutEmail = visibleOffers.filter((o) => !o.contact);
  const selectedOffers = withEmail.filter((o) => o.selected);

  return (
    <div className="site" data-theme={ws}>
      <header className="site-header">
        <div className="site-motif" />
        <h1>{label.name}</h1>
        <div className="site-sub">Recherche de CDI</div>
        <div className="header-actions">
          <div className="demo-badge">En ligne</div>
          <form className="logout-form" action="/api/auth/logout" method="POST">
            <button type="submit">Déconnexion</button>
          </form>
        </div>
      </header>

      <nav className="tabs">
        <button className={`tab-btn ${tab === "recherche" ? "active" : ""}`} onClick={() => setTab("recherche")}>
          Recherche
        </button>
        <button
          className={`tab-btn ${tab === "candidatures" ? "active" : ""}`}
          onClick={() => setTab("candidatures")}
        >
          Candidatures
        </button>
        <button className={`tab-btn ${tab === "reglages" ? "active" : ""}`} onClick={() => setTab("reglages")}>
          Réglages
        </button>
        <Link className="home-link" href="/">
          ⌂ Accueil
        </Link>
      </nav>

      <main>
        {message ? <div className={`alert ${message.type}`}>{message.text}</div> : null}

        {tab === "recherche" ? (
          <section className="tabpane active">
            <div className="panel">
              <h2>Mon profil</h2>
              <div className="grid2">
                <div className="field">
                  <label>Poste recherché</label>
                  <input
                    value={profile.poste}
                    onChange={(e) => setProfile({ ...profile, poste: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Localisation (code postal)</label>
                  <input
                    value={profile.localisation}
                    placeholder="75001"
                    inputMode="numeric"
                    maxLength={5}
                    onChange={(e) =>
                      setProfile({ ...profile, localisation: e.target.value.replace(/\D/g, "").slice(0, 5) })
                    }
                  />
                </div>
                <div className="field">
                  <label>Expérience</label>
                  <input
                    value={profile.experience}
                    onChange={(e) => setProfile({ ...profile, experience: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Secteurs préférés</label>
                  <input
                    value={profile.secteurs}
                    onChange={(e) => setProfile({ ...profile, secteurs: e.target.value })}
                  />
                </div>
              </div>
              <button className="secondary" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? "Enregistrement…" : "Enregistrer le profil"}
              </button>
            </div>

            <div className="panel">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2>Offres CDI</h2>
                <div className="row">
                  <button
                    type="button"
                    className={cdiCddOnly ? "" : "secondary"}
                    onClick={() => setCdiCddOnly((v) => !v)}
                  >
                    {cdiCddOnly ? "✓ CDI/CDD uniquement" : "CDI/CDD uniquement"}
                  </button>
                  <a className="link" href={linkedinUrl} target="_blank" rel="noreferrer">
                    Ouvrir la recherche LinkedIn ↗
                  </a>
                  <button onClick={runSearch} disabled={searching}>
                    {searching ? "Analyse en cours…" : "Analyser"}
                  </button>
                </div>
              </div>
              <p className="muted">
                Recherche réelle via France Travail, Adzuna, Google et Arbeitnow — configure tes clés dans
                l'onglet Réglages. Aucune automatisation LinkedIn : le lien ci-dessus s'ouvre manuellement.
                {cdiCddOnly ? " Stages et alternances exclus des résultats." : " Stages et alternances inclus."}
                Les offres avec un email de contact sont affichées en premier ; la plupart des jobboards
                n'en fournissent volontairement pas (anti-spam), ces offres restent accessibles via leur
                lien de candidature, plus bas.
              </p>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Intitulé</th>
                    <th>Entreprise</th>
                    <th>Lieu</th>
                    <th>Contact</th>
                    <th>Exigences clés</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {withEmail.map((o) => (
                    <tr key={o.id} className={o.selected ? "" : "is-unselected"}>
                      <td>
                        <input
                          type="checkbox"
                          checked={o.selected}
                          onChange={(e) => toggleOffer(o.id, e.target.checked)}
                        />
                      </td>
                      <td>{o.url ? <a className="link" href={o.url} target="_blank" rel="noreferrer">{o.titre}</a> : o.titre}</td>
                      <td>{o.entreprise}</td>
                      <td>{o.lieu}</td>
                      <td>
                        {o.contact}
                        {o.contactGuessed ? (
                          <>
                            <br />
                            <span className="muted" style={{ fontSize: 11 }}>
                              contact générique entreprise, trouvé sur le web
                            </span>
                          </>
                        ) : null}
                      </td>
                      <td style={{ whiteSpace: "pre-line" }}>{o.exigences}</td>
                      <td className="muted">{o.source}</td>
                    </tr>
                  ))}
                  {withoutEmail.length > 0 ? (
                    <tr>
                      <td colSpan={7} className="muted" style={{ paddingTop: 22, fontWeight: 600 }}>
                        Autres offres — sans email, via lien de candidature uniquement
                      </td>
                    </tr>
                  ) : null}
                  {withoutEmail.map((o) => (
                    <tr key={o.id}>
                      <td>
                        {o.url ? (
                          <button type="button" onClick={() => window.open(o.url!, "_blank", "noreferrer")}>
                            Postuler ↗
                          </button>
                        ) : null}
                      </td>
                      <td>{o.url ? <a className="link" href={o.url} target="_blank" rel="noreferrer">{o.titre}</a> : o.titre}</td>
                      <td>{o.entreprise}</td>
                      <td>{o.lieu}</td>
                      <td><span className="muted">via lien</span></td>
                      <td style={{ whiteSpace: "pre-line" }}>{o.exigences}</td>
                      <td className="muted">{o.source}</td>
                    </tr>
                  ))}
                  {visibleOffers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        Aucune offre pour l'instant — clique « Analyser ».
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "candidatures" ? (
          <section className="tabpane active">
            {selectedOffers.length > 0 ? (
              <div className="panel">
                <h2>Offres avec email — lettre &amp; envoi (bientôt)</h2>
                <p className="muted">
                  {selectedOffers.length} offre(s) avec un vrai email de contact. La génération de lettres
                  et l'envoi arrivent dans une prochaine version — toujours avec validation humaine
                  explicite avant tout envoi.
                </p>
                {selectedOffers.map((o) => (
                  <div className="panel" style={{ marginBottom: 12 }} key={o.id}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <strong>{o.titre}</strong> — {o.entreprise}
                        <div className="muted">
                          Email : {o.contact}
                          {o.contactGuessed ? " (contact générique entreprise, trouvé sur le web)" : ""}
                        </div>
                      </div>
                      <div className="row">
                        <span className="muted">{o.source}</span>
                        {o.url ? (
                          <button type="button" onClick={() => window.open(o.url!, "_blank", "noreferrer")}>
                            Postuler ↗
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="panel">
              <h2>Offres via lien de candidature</h2>
              <p className="muted">
                {withoutEmail.length} offre(s) — la quasi-totalité des jobboards (France Travail, Adzuna,
                Arbeitnow...) n'exposent volontairement aucun email de contact, pour éviter le spam. Un
                clic sur « Postuler » ouvre directement le lien officiel de l'offre.
              </p>
              {withoutEmail.map((o) => (
                <div className="panel" style={{ marginBottom: 12 }} key={o.id}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <strong>{o.titre}</strong> — {o.entreprise}
                      <div className="muted">{o.lieu}</div>
                    </div>
                    <div className="row">
                      <span className="muted">{o.source}</span>
                      {o.url ? (
                        <button type="button" onClick={() => window.open(o.url!, "_blank", "noreferrer")}>
                          Postuler ↗
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
              {withoutEmail.length === 0 && selectedOffers.length === 0 ? (
                <p className="muted">Aucune offre pour l'instant — lance une recherche dans l'onglet Recherche.</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {tab === "reglages" ? (
          <section className="tabpane active">
            <div className="panel">
              <h2>Sources d'offres</h2>
              <div className="field">
                <label>
                  France Travail — Client ID{" "}
                  {settings.franceTravailSecretSet ? <span className="badge ok">secret configuré</span> : <span className="badge off">secret manquant</span>}
                </label>
                <input
                  value={settings.franceTravailClientId}
                  onChange={(e) => setSettings({ ...settings, franceTravailClientId: e.target.value })}
                />
              </div>
              <div className="field">
                <label>France Travail — Client Secret</label>
                <input
                  type="password"
                  placeholder={settings.franceTravailSecretSet ? "•••••••• (laisser vide pour garder)" : ""}
                  value={secretInputs.franceTravailSecret}
                  onChange={(e) => setSecretInputs({ ...secretInputs, franceTravailSecret: e.target.value })}
                />
              </div>
              <div className="grid2">
                <div className="field">
                  <label>
                    Adzuna — App ID{" "}
                    {settings.adzunaAppKeySet ? <span className="badge ok">clé configurée</span> : <span className="badge off">clé manquante</span>}
                  </label>
                  <input
                    value={settings.adzunaAppId}
                    onChange={(e) => setSettings({ ...settings, adzunaAppId: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Adzuna — App Key</label>
                  <input
                    type="password"
                    placeholder={settings.adzunaAppKeySet ? "•••••••• (laisser vide pour garder)" : ""}
                    value={secretInputs.adzunaAppKey}
                    onChange={(e) => setSecretInputs({ ...secretInputs, adzunaAppKey: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label>
                    Google CSE — ID moteur{" "}
                    {settings.googleCseKeySet ? <span className="badge ok">clé configurée</span> : <span className="badge off">clé manquante</span>}
                  </label>
                  <input
                    value={settings.googleCseId}
                    onChange={(e) => setSettings({ ...settings, googleCseId: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Google CSE — API Key</label>
                  <input
                    type="password"
                    placeholder={settings.googleCseKeySet ? "•••••••• (laisser vide pour garder)" : ""}
                    value={secretInputs.googleCseKey}
                    onChange={(e) => setSecretInputs({ ...secretInputs, googleCseKey: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label>
                  Hunter.io — API Key{" "}
                  {settings.hunterApiKeySet ? <span className="badge ok">clé configurée</span> : <span className="badge off">clé manquante</span>}
                </label>
                <input
                  type="password"
                  placeholder={settings.hunterApiKeySet ? "•••••••• (laisser vide pour garder)" : "clé Hunter.io (hunter.io/api-keys)"}
                  value={secretInputs.hunterApiKey}
                  onChange={(e) => setSecretInputs({ ...secretInputs, hunterApiKey: e.target.value })}
                />
                <p className="muted" style={{ marginTop: 6 }}>
                  Trouve un email générique d'entreprise (contact@, rh@...) quand l'annonce n'en expose
                  aucun. Quota gratuit très limité (25/mois, partagé Elomty+Didi) — utilisé au compte-goutte
                  (5 offres max par recherche).
                </p>
              </div>
              <button className="secondary" onClick={saveSettings} disabled={savingSettings}>
                {savingSettings ? "Enregistrement…" : "Enregistrer les réglages"}
              </button>
            </div>

            <div className="panel">
              <h2>Envoi des emails</h2>
              <div className="field">
                <label>Adresse Gmail d'envoi</label>
                <input
                  placeholder="prenom.nom@gmail.com"
                  value={settings.gmailAddress}
                  onChange={(e) => setSettings({ ...settings, gmailAddress: e.target.value })}
                />
              </div>
              <p className="muted">
                La connexion OAuth Google et l'envoi d'email (toujours après relecture et validation
                manuelle) arrivent dans une prochaine version.
              </p>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
