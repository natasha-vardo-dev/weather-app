import type { MessagesFactory } from '../messages';

export const uk: MessagesFactory = ({ deg, plural }) => ({
  appName: 'Прогноз погоди',
  language: 'Мова',
  dataBy: 'Дані про погоду:',
  home: {
    title: 'Яка погода там, куди ви їдете?',
    text: (days) =>
      `Знайдіть місто, щоб побачити поточну погоду й прогноз на ${plural(days, { one: '{n} день', few: '{n} дні', many: '{n} днів', other: '{n} дня' })}.`,
  },
  notFound: {
    pageTitle: 'Не знайдено',
    title: 'Тут нічого немає',
    pageMissing: 'Такої сторінки не існує.',
    badLink: 'Це посилання не веде до коректного місця.',
    goHome: 'Перейти на головну',
    orSearch: 'або знайдіть місто вище.',
  },
  search: {
    label: 'Пошук міста',
    searching: 'Шукаю…',
    noResults: (q) => `Немає міст, що відповідають «${q}». Перевірте написання.`,
  },
  weather: { loading: (place) => `Завантажую прогноз: ${place}…`, tryAgain: 'Спробувати ще раз' },
  current: {
    degrees: (n) =>
      plural(n, { one: '{n} градус', few: '{n} градуси', many: '{n} градусів', other: '{n} градуса' }),
    highLow: (h, l) => `Макс. ${deg(h)}, мін. ${deg(l)}`,
    warmer: (n) => `На ${deg(n)} тепліше, ніж учора`,
    cooler: (n) => `На ${deg(n)} холодніше, ніж учора`,
    same: 'Приблизно як учора',
    feelsLike: 'Відчувається як',
    humidity: 'Вологість',
    wind: 'Вітер',
  },
  hourly: {
    title: (n) =>
      plural(n, {
        one: 'Найближча {n} година',
        few: 'Найближчі {n} години',
        many: 'Найближчі {n} годин',
        other: 'Найближчі {n} години',
      }),
    now: 'Зараз',
    rainChance: (pct) => `Імовірність дощу ${pct}`,
  },
  daily: {
    title: (n) =>
      plural(n, {
        one: 'Найближчий {n} день',
        few: 'Найближчі {n} дні',
        many: 'Найближчі {n} днів',
        other: 'Найближчі {n} дня',
      }),
    today: 'Сьогодні',
    yesterday: 'Учора',
    rain: (pct) => `дощ ${pct}`,
  },
  conditions: {
    'clear-sky': 'Ясно',
    'mostly-clear': 'Переважно ясно',
    'partly-cloudy': 'Мінлива хмарність',
    overcast: 'Хмарно',
    fog: 'Туман',
    drizzle: 'Мряка',
    rain: 'Дощ',
    snow: 'Сніг',
    'rain-showers': 'Злива',
    'snow-showers': 'Короткочасний сніг',
    thunderstorm: 'Гроза',
    unknown: 'Невідомо',
  },
  errors: {
    INVALID_REQUEST: 'Некоректний запит. Перевірте адресу й спробуйте ще раз.',
    PROVIDER_ERROR: 'Сервіс погоди не відповідає. Спробуйте трохи пізніше.',
    NOT_FOUND: 'Нічого не знайдено.',
    INTERNAL: 'Щось пішло не так. Спробуйте ще раз.',
    NETWORK_ERROR: "Немає з'єднання з сервером. Перевірте інтернет і спробуйте ще раз.",
  },
});
