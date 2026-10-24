import type { MessagesFactory } from '../messages';

export const cs: MessagesFactory = ({ deg, plural }) => ({
  appName: 'Předpověď počasí',
  language: 'Jazyk',
  dataBy: 'Data o počasí:',
  home: {
    title: 'Jaké bude počasí tam, kam jedete?',
    text: (days) =>
      `Vyhledejte město a uvidíte aktuální počasí a předpověď na ${plural(days, { one: '{n} den', few: '{n} dny', other: '{n} dní' })}.`,
  },
  notFound: {
    pageTitle: 'Nenalezeno',
    title: 'Nic tu není',
    pageMissing: 'Tato stránka neexistuje.',
    badLink: 'Tento odkaz nevede na platné místo.',
    goHome: 'Přejít na úvodní stránku',
    orSearch: 'nebo vyhledejte město výše.',
  },
  search: {
    label: 'Vyhledat město',
    searching: 'Hledám…',
    noResults: (q) => `Žádné město neodpovídá „${q}“. Zkontrolujte pravopis.`,
  },
  weather: { loading: (place) => `Načítám předpověď: ${place}…`, tryAgain: 'Zkusit znovu' },
  current: {
    degrees: (n) =>
      plural(n, { one: '{n} stupeň', few: '{n} stupně', many: '{n} stupně', other: '{n} stupňů' }),
    highLow: (h, l) => `Max. ${deg(h)}, min. ${deg(l)}`,
    warmer: (n) => `O ${deg(n)} tepleji než včera`,
    cooler: (n) => `O ${deg(n)} chladněji než včera`,
    same: 'Přibližně jako včera',
    feelsLike: 'Pocitově',
    humidity: 'Vlhkost',
    wind: 'Vítr',
    airQuality: 'Kvalita ovzduší',
  },
  hourly: {
    title: (n) =>
      plural(n, {
        one: 'Příští hodina',
        few: 'Příští {n} hodiny',
        many: 'Příštích {n} hodiny',
        other: 'Příštích {n} hodin',
      }),
    now: 'Teď',
    rainChance: (pct) => `Pravděpodobnost deště ${pct}`,
  },
  daily: {
    title: (n) =>
      plural(n, { one: 'Příští den', few: 'Příští {n} dny', many: 'Příštích {n} dne', other: 'Příštích {n} dní' }),
    today: 'Dnes',
    yesterday: 'Včera',
    rain: (pct) => `déšť ${pct}`,
  },
  conditions: {
    'clear-sky': 'Jasno',
    'mostly-clear': 'Převážně jasno',
    'partly-cloudy': 'Polojasno',
    overcast: 'Zataženo',
    fog: 'Mlha',
    drizzle: 'Mrholení',
    rain: 'Déšť',
    snow: 'Sníh',
    'rain-showers': 'Přeháňky',
    'snow-showers': 'Sněhové přeháňky',
    thunderstorm: 'Bouřka',
    unknown: 'Neznámé',
  },
  airQualityLevels: {
    good: 'Dobrá',
    fair: 'Přijatelná',
    moderate: 'Mírná',
    poor: 'Špatná',
    'very-poor': 'Velmi špatná',
    'extremely-poor': 'Extrémně špatná',
    'unhealthy-sensitive': 'Nezdravá pro citlivé skupiny',
    unhealthy: 'Nezdravá',
    'very-unhealthy': 'Velmi nezdravá',
    hazardous: 'Nebezpečná',
  },
  airQualityScales: {
    european: 'Evropský index kvality ovzduší',
    us: 'Americký index kvality ovzduší (EPA)',
  },
  pollutants: {
    title: 'Znečišťující látky',
    ozone: 'Ozon',
    nitrogenDioxide: 'Oxid dusičitý',
  },
  favorites: {
    title: 'Oblíbené',
    save: 'Uložit',
    saved: 'Uloženo',
    add: 'Přidat do oblíbených',
    remove: 'Odebrat z oblíbených',
    full: (n) => `Můžete uložit až ${plural(n, { one: '{n} město', few: '{n} města', other: '{n} měst' })}`,
  },
  errors: {
    INVALID_REQUEST: 'Neplatný požadavek. Zkontrolujte adresu a zkuste to znovu.',
    PROVIDER_ERROR: 'Služba počasí neodpovídá. Zkuste to za chvíli znovu.',
    NOT_FOUND: 'Nic nenalezeno.',
    INTERNAL: 'Něco se pokazilo. Zkuste to znovu.',
    NETWORK_ERROR: 'Žádné připojení k serveru. Zkontrolujte internet a zkuste to znovu.',
  },
});
