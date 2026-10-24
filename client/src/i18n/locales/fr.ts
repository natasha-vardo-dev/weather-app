import type { MessagesFactory } from '../messages';

export const fr: MessagesFactory = ({ num, deg, plural }) => ({
  appName: 'Prévisions météo',
  language: 'Langue',
  dataBy: 'Données météo fournies par',
  home: {
    title: 'Quel temps fera-t-il là où vous allez ?',
    text: (days) =>
      `Recherchez une ville pour voir la météo actuelle et les prévisions sur ${num(days)} jours.`,
  },
  notFound: {
    pageTitle: 'Introuvable',
    title: 'Rien ici',
    pageMissing: "Cette page n'existe pas.",
    badLink: 'Ce lien ne correspond à aucun lieu valide.',
    goHome: "Revenir à l'accueil",
    orSearch: 'ou cherchez une ville ci-dessus.',
  },
  search: {
    label: 'Rechercher une ville',
    searching: 'Recherche…',
    noResults: (q) => `Aucune ville ne correspond à « ${q} ». Vérifiez l'orthographe.`,
  },
  weather: { loading: (place) => `Chargement des prévisions pour ${place}…`, tryAgain: 'Réessayer' },
  current: {
    degrees: (n) => plural(n, { one: '{n} degré', other: '{n} degrés' }),
    highLow: (h, l) => `Max. ${deg(h)}, min. ${deg(l)}`,
    warmer: (n) => `${deg(n)} de plus qu'hier`,
    cooler: (n) => `${deg(n)} de moins qu'hier`,
    same: 'À peu près comme hier',
    feelsLike: 'Ressenti',
    humidity: 'Humidité',
    wind: 'Vent',
  },
  hourly: {
    title: (n) => plural(n, { one: 'Prochaine heure', other: '{n} prochaines heures' }),
    now: 'Maintenant',
    rainChance: (pct) => `${pct} de risque de pluie`,
  },
  daily: {
    title: (n) => plural(n, { one: 'Prochain jour', other: '{n} prochains jours' }),
    today: "Aujourd'hui",
    yesterday: 'Hier',
    rain: (pct) => `${pct} de pluie`,
  },
  conditions: {
    'clear-sky': 'Ciel dégagé',
    'mostly-clear': 'Plutôt dégagé',
    'partly-cloudy': 'Partiellement nuageux',
    overcast: 'Couvert',
    fog: 'Brouillard',
    drizzle: 'Bruine',
    rain: 'Pluie',
    snow: 'Neige',
    'rain-showers': 'Averses',
    'snow-showers': 'Averses de neige',
    thunderstorm: 'Orage',
    unknown: 'Inconnu',
  },
  errors: {
    INVALID_REQUEST: "La requête n'est pas valide. Vérifiez l'adresse et réessayez.",
    PROVIDER_ERROR: 'Le service météo ne répond pas. Réessayez dans un instant.',
    NOT_FOUND: 'Aucun résultat.',
    INTERNAL: "Une erreur s'est produite. Réessayez.",
    NETWORK_ERROR: 'Pas de connexion au serveur. Vérifiez votre connexion Internet et réessayez.',
  },
});
