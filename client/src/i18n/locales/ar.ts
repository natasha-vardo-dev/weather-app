import type { MessagesFactory } from '../messages';

// Arabic has six plural forms: zero, one, two, few (3–10), many (11–99), other.
export const ar: MessagesFactory = ({ deg, plural }) => ({
  appName: 'توقعات الطقس',
  language: 'اللغة',
  dataBy: 'بيانات الطقس من',
  home: {
    title: 'كيف سيكون الطقس حيث تذهب؟',
    text: (days) =>
      `ابحث عن مدينة لمعرفة الطقس الحالي وتوقعات ${plural(days, { one: 'يوم واحد', two: 'يومين', few: '{n} أيام', other: '{n} يومًا' })}.`,
  },
  notFound: {
    pageTitle: 'غير موجود',
    title: 'لا يوجد شيء هنا',
    pageMissing: 'هذه الصفحة غير موجودة.',
    badLink: 'هذا الرابط لا يشير إلى موقع صالح.',
    goHome: 'الانتقال إلى الصفحة الرئيسية',
    orSearch: 'أو ابحث عن مدينة في الأعلى.',
  },
  search: {
    label: 'ابحث عن مدينة',
    searching: 'جارٍ البحث…',
    noResults: (q) => `لا توجد مدينة تطابق «${q}». تحقق من الكتابة.`,
  },
  weather: { loading: (place) => `جارٍ تحميل توقعات ${place}…`, tryAgain: 'إعادة المحاولة' },
  current: {
    degrees: (n) =>
      plural(n, {
        zero: '{n} درجة',
        one: 'درجة واحدة',
        two: 'درجتان',
        few: '{n} درجات',
        many: '{n} درجة',
        other: '{n} درجة',
      }),
    highLow: (h, l) => `العظمى ${deg(h)}، الصغرى ${deg(l)}`,
    warmer: (n) => `أدفأ من أمس بـ ${deg(n)}`,
    cooler: (n) => `أبرد من أمس بـ ${deg(n)}`,
    same: 'تقريبًا مثل أمس',
    feelsLike: 'الإحساس الحراري',
    humidity: 'الرطوبة',
    wind: 'الرياح',
  },
  hourly: {
    title: (n) =>
      plural(n, {
        one: 'الساعة القادمة',
        two: 'الساعتان القادمتان',
        few: 'الساعات الـ{n} القادمة',
        other: 'الـ{n} ساعة القادمة',
      }),
    now: 'الآن',
    rainChance: (pct) => `احتمال المطر ${pct}`,
  },
  daily: {
    title: (n) =>
      plural(n, {
        one: 'اليوم القادم',
        two: 'اليومان القادمان',
        few: 'الأيام الـ{n} القادمة',
        other: 'الـ{n} يومًا القادمة',
      }),
    today: 'اليوم',
    yesterday: 'أمس',
    rain: (pct) => `مطر ${pct}`,
  },
  conditions: {
    'clear-sky': 'سماء صافية',
    'mostly-clear': 'صافٍ في الغالب',
    'partly-cloudy': 'غائم جزئيًا',
    overcast: 'غائم',
    fog: 'ضباب',
    drizzle: 'رذاذ',
    rain: 'مطر',
    snow: 'ثلج',
    'rain-showers': 'زخات مطر',
    'snow-showers': 'زخات ثلج',
    thunderstorm: 'عاصفة رعدية',
    unknown: 'غير معروف',
  },
  errors: {
    INVALID_REQUEST: 'الطلب غير صالح. تحقق من العنوان وحاول مرة أخرى.',
    PROVIDER_ERROR: 'خدمة الطقس لا تستجيب. حاول مرة أخرى بعد قليل.',
    NOT_FOUND: 'لم يتم العثور على شيء.',
    INTERNAL: 'حدث خطأ ما. حاول مرة أخرى.',
    NETWORK_ERROR: 'لا يوجد اتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.',
  },
});
