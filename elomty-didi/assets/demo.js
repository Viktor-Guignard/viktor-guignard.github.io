// Démo statique — données fictives, aucune requête réseau réelle.
const DONNEES = {
  elomty: {
    poste: "Chef de projet digital",
    offres: [
      { titre: "Chef de projet digital", entreprise: "Nusantara Tech", lieu: "Paris", contact: "recrutement@nusantara-tech.fr", exigences: "3 ans exp. gestion de projet\nMaîtrise Jira/Scrum\nAnglais courant", source: "France Travail" },
      { titre: "Chef de projet e-commerce", entreprise: "Java Digital", lieu: "Remote", contact: "jobs@javadigital.io", exigences: "Connaissance Shopify\nPilotage prestataires\nCulture data", source: "Adzuna" },
      { titre: "Product Owner", entreprise: "Batik Studio", lieu: "Lyon", contact: null, exigences: "Rédaction specs\nAnimation ateliers\nBacklog produit", source: "Google" },
    ],
  },
  didi: {
    poste: "Responsable communication",
    offres: [
      { titre: "Responsable communication", entreprise: "Atlas Media", lieu: "Marseille", contact: "rh@atlasmedia.fr", exigences: "5 ans exp. com externe\nRéseaux sociaux\nRelations presse", source: "France Travail" },
      { titre: "Chargé·e de communication", entreprise: "Kabylie Events", lieu: "Paris", contact: "contact@kabylie-events.com", exigences: "Organisation événementiel\nCanva/Adobe\nAnglais", source: "Adzuna" },
      { titre: "Community Manager", entreprise: "Souk Digital", lieu: "Remote", contact: null, exigences: "Stratégie de contenu\nAnalytics\nCréativité", source: "Google" },
    ],
  },
};

function initTabs() {
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-tab]").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tabpane").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

function ligneOffre(o, i) {
  return `<tr data-row="${i}">
    <td><input type="checkbox" checked onchange="this.closest('tr').style.opacity=this.checked?1:0.4" /></td>
    <td>${o.titre}</td>
    <td>${o.entreprise}</td>
    <td>${o.lieu}</td>
    <td>${o.contact ?? '<span class="muted">non trouvé</span>'}</td>
    <td style="white-space:pre-line">${o.exigences}</td>
    <td class="muted">${o.source}</td>
  </tr>`;
}

function ligneCandidature(o) {
  return `<div class="panel" style="margin-bottom:12px">
    <div class="row" style="justify-content:space-between">
      <div><strong>${o.titre}</strong> — ${o.entreprise}<div class="muted">${o.contact ?? "pas d'email de contact"}</div></div>
      <label class="row"><input type="checkbox" /> sélectionner</label>
    </div>
    <div style="margin-top:10px">
      <div class="field"><label>Objet</label><input value="Candidature - ${o.titre} - Prénom Nom" readonly /></div>
      <div class="field"><label>Corps de l'email</label><textarea rows="4" readonly>Bonjour, je me permets de vous adresser ma candidature pour le poste de ${o.titre} au sein de ${o.entreprise}. Vous trouverez ci-joint mon CV ainsi qu'une lettre de motivation. Cordialement, Prénom Nom</textarea></div>
      <span class="muted">Lettre_PDF_${o.entreprise.replace(/\s+/g, "_")}.pdf (démo)</span>
    </div>
  </div>`;
}

function initWorkspace(ws) {
  const data = DONNEES[ws];
  document.getElementById("poste-input").value = data.poste;
  document.getElementById("linkedin-link").href =
    "https://www.linkedin.com/jobs/search/?keywords=" + encodeURIComponent(data.poste) + "&f_JT=F";
  document.getElementById("offres-body").innerHTML = data.offres.map(ligneOffre).join("");
  document.getElementById("candidatures-list").innerHTML = data.offres.map(ligneCandidature).join("");

  document.getElementById("analyser-btn").addEventListener("click", (e) => {
    e.target.disabled = true;
    e.target.textContent = "Analyse en cours (démo)…";
    setTimeout(() => {
      e.target.disabled = false;
      e.target.textContent = "Analyser";
      document.getElementById("analyse-msg").textContent = "Démo : aucune vraie recherche effectuée, ceci est un aperçu visuel.";
    }, 900);
  });

  initTabs();
}
