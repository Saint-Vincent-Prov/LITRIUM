import type { DB, Grade, User } from "./types";

/** Demo accounts that "exist" on the service: adding one of these emails makes an instant friend. */
export const DIRECTORY = [
  { name: "Léa Marchand", email: "lea.marchand@exemple.fr" },
  { name: "Hugo Bernard", email: "hugo.bernard@exemple.fr" },
  { name: "Inès Haddad", email: "ines.haddad@exemple.fr" },
  { name: "Tom Lefèvre", email: "tom.lefevre@exemple.fr" },
  { name: "Sarah Nguyen", email: "sarah.nguyen@exemple.fr" },
];

function at(dayOffset: number, h: number, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function buildSeed(): DB {
  return {
    session: true,
    user: { id: "me", name: "Camille Durand", email: "camille@exemple.fr", unit: "C", notifications: false },
    friends: [
      { id: "fr_lea", name: "Léa Marchand", email: "lea.marchand@exemple.fr", status: "friend", since: at(-40, 10) },
      { id: "fr_hugo", name: "Hugo Bernard", email: "hugo.bernard@exemple.fr", status: "friend", since: at(-12, 18) },
      { id: "fr_ines", name: "Inès Haddad", email: "ines.haddad@exemple.fr", status: "pending_in", since: at(-1, 9) },
    ],
    messages: [
      { id: "m1", friendId: "fr_lea", from: "them", text: "Coucou ! On se voit toujours jeudi ?", at: at(-1, 19, 4), read: true },
      { id: "m2", friendId: "fr_lea", from: "me", text: "Oui, 19h au café du port 🙂", at: at(-1, 19, 10), read: true },
      { id: "m3", friendId: "fr_lea", from: "them", text: "Parfait, je réserve une table.", at: at(0, 8, 42), read: false },
      { id: "m4", friendId: "fr_hugo", from: "them", text: "Tu as les photos du week-end ?", at: at(-3, 21, 15), read: true },
      { id: "m5", friendId: "fr_hugo", from: "me", text: "Je te les envoie ce soir.", at: at(-3, 21, 20), read: true },
    ],
    events: [
      { id: "ev1", title: "Point d'équipe", start: at(0, 10), end: at(0, 10, 45), allDay: false, color: "sky", location: "Visio" },
      { id: "ev2", title: "Sport", start: at(0, 18, 30), end: at(0, 19, 30), allDay: false, color: "mint", location: "Salle Lumière" },
      { id: "ev3", title: "Dîner avec Léa", start: at(1, 19), end: at(1, 21), allDay: false, color: "peach", location: "Café du port" },
      { id: "ev4", title: "Anniversaire de maman", start: at(4, 0), end: at(4, 23, 59), allDay: true, color: "violet" },
      { id: "ev5", title: "Dentiste", start: at(6, 9, 15), end: at(6, 10), allDay: false, color: "sky", note: "Apporter la carte vitale" },
      {
        id: "ev6",
        title: "Atelier de préparation de la présentation trimestrielle avec toute l'équipe produit",
        start: at(2, 14),
        end: at(2, 16),
        allDay: false,
        color: "violet",
      },
    ],
    alarms: [
      { id: "al1", time: "07:00", days: [1, 2, 3, 4, 5], label: "Réveil semaine", enabled: true },
      { id: "al2", time: "09:30", days: [0, 6], label: "Week-end", enabled: false },
    ],
    notes: [
      { id: "n1", title: "Idées cadeaux", body: "Maman : livre de cuisine, plaid.\nLéa : places de concert.", pinned: true, updatedAt: at(-2, 20) },
      { id: "n2", title: "Courses", body: "Lait, œufs, pain, tomates, café.", pinned: false, updatedAt: at(0, 7, 50) },
      { id: "n3", title: "Livres à lire", body: "1. Un roman policier\n2. Un essai sur le sommeil", pinned: false, updatedAt: at(-6, 22) },
    ],
    reminders: [
      { id: "r1", text: "Payer la facture d'électricité", due: at(0, 17), done: false, notified: false },
      { id: "r2", text: "Rappeler le plombier", due: at(-1, 11), done: false, notified: true },
      { id: "r3", text: "Arroser les plantes", done: true, notified: true },
    ],
    cities: [
      { id: "c_paris", name: "Paris", admin: "Île-de-France", country: "France", lat: 48.8534, lon: 2.3488 },
      { id: "c_lisbon", name: "Lisbonne", admin: "Lisbonne", country: "Portugal", lat: 38.7167, lon: -9.1333 },
    ],
    clocks: [
      { id: "k_ny", name: "New York", admin: "New York", country: "États-Unis", timezone: "America/New_York" },
      { id: "k_tokyo", name: "Tokyo", admin: "Tokyo", country: "Japon", timezone: "Asia/Tokyo" },
    ],
    subjects: [
      { id: "s1", name: "Mathématiques", coef: 4 },
      { id: "s2", name: "Français", coef: 4 },
      { id: "s3", name: "Histoire-Géographie", coef: 3 },
      { id: "s4", name: "Anglais", coef: 3 },
      { id: "s5", name: "Physique-Chimie", coef: 3 },
    ],
    grades: demoGrades(),
  };
}

function demoGrades(): Grade[] {
  const rows: [string, string, number, number, number, number][] = [
    ["Mathématiques", "Contrôle fonctions", 14.5, 20, 2, -40],
    ["Mathématiques", "Interrogation dérivées", 8, 10, 1, -26],
    ["Mathématiques", "DM suites", 17, 20, 0.5, -12],
    ["Français", "Dissertation", 12, 20, 2, -35],
    ["Français", "Commentaire", 13.5, 20, 2, -14],
    ["Histoire-Géographie", "Composition", 15, 20, 1, -30],
    ["Histoire-Géographie", "Croquis", 16, 20, 1, -9],
    ["Anglais", "Oral", 17.5, 20, 1, -22],
    ["Anglais", "Compréhension écrite", 11, 20, 1, -6],
    ["Physique-Chimie", "TP titrage", 9.5, 20, 1, -28],
    ["Physique-Chimie", "Contrôle", 11.5, 20, 2, -8],
  ];
  return rows.map(([subject, title, value, outOf, coef, days], i) => ({
    id: `g${i + 1}`,
    subject,
    title,
    value,
    outOf,
    coef,
    date: at(days, 12).slice(0, 10),
    period: "Trimestre 1",
    virtual: false,
    source: "manual" as const,
  }));
}

/** What a brand-new account starts with: nearly empty, with a welcome note. */
export function buildStarter(user: User): DB {
  const now = new Date().toISOString();
  return {
    session: true,
    user,
    friends: [],
    messages: [],
    events: [],
    alarms: [],
    notes: [
      {
        id: "n_welcome",
        title: "Bienvenue sur Litrium 👋",
        body: "Essayez l'assistant : « rappelle-moi de boire de l'eau dans 1 heure », « réveille-moi à 7h », ou posez-lui n'importe quelle question.\nAjoutez vos amis depuis Messages avec leur adresse e-mail.",
        pinned: true,
        updatedAt: now,
      },
    ],
    reminders: [],
    cities: [{ id: "c_paris", name: "Paris", admin: "Île-de-France", country: "France", lat: 48.8534, lon: 2.3488 }],
    clocks: [],
    grades: [],
    subjects: [],
  };
}
