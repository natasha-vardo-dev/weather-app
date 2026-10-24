import type { MessagesFactory } from '../messages';

// Japanese has no grammatical plural, so no plural() here.
export const ja: MessagesFactory = ({ num, deg }) => ({
  appName: '天気予報',
  language: '言語',
  dataBy: '気象データ提供:',
  home: {
    title: '行き先の天気は？',
    text: (days) => `都市を検索すると、現在の天気と${num(days)}日間の予報を確認できます。`,
  },
  notFound: {
    pageTitle: '見つかりません',
    title: 'ページがありません',
    pageMissing: 'このページは存在しません。',
    badLink: 'このリンクは有効な場所を指していません。',
    goHome: 'トップページへ',
    orSearch: 'または上で都市を検索してください。',
  },
  search: {
    label: '都市を検索',
    searching: '検索中…',
    noResults: (q) => `「${q}」に一致する都市はありません。綴りを確認してください。`,
  },
  weather: { loading: (place) => `${place}の予報を読み込み中…`, tryAgain: '再試行' },
  current: {
    degrees: (n) => `${num(n)}度`,
    highLow: (h, l) => `最高 ${deg(h)}、最低 ${deg(l)}`,
    warmer: (n) => `昨日より${deg(n)}暖かい`,
    cooler: (n) => `昨日より${deg(n)}寒い`,
    same: '昨日とほぼ同じ',
    feelsLike: '体感温度',
    humidity: '湿度',
    wind: '風',
  },
  hourly: {
    title: (n) => `今後${num(n)}時間`,
    now: '現在',
    rainChance: (pct) => `降水確率 ${pct}`,
  },
  daily: {
    title: (n) => `今後${num(n)}日間`,
    today: '今日',
    yesterday: '昨日',
    rain: (pct) => `雨 ${pct}`,
  },
  conditions: {
    'clear-sky': '快晴',
    'mostly-clear': 'おおむね晴れ',
    'partly-cloudy': '晴れ時々曇り',
    overcast: '曇り',
    fog: '霧',
    drizzle: '霧雨',
    rain: '雨',
    snow: '雪',
    'rain-showers': 'にわか雨',
    'snow-showers': 'にわか雪',
    thunderstorm: '雷雨',
    unknown: '不明',
  },
  errors: {
    INVALID_REQUEST: 'リクエストが正しくありません。アドレスを確認して、もう一度お試しください。',
    PROVIDER_ERROR: '気象サービスが応答していません。しばらくしてからもう一度お試しください。',
    NOT_FOUND: '見つかりませんでした。',
    INTERNAL: '問題が発生しました。もう一度お試しください。',
    NETWORK_ERROR: 'サーバーに接続できません。インターネット接続を確認して、もう一度お試しください。',
  },
});
