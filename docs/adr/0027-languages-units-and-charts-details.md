# 0027. Language, unit, settings and detail-chart details

- Status: Accepted
- Date: 2026-11-02

## Context

[0008](0008-languages-and-units.md) sets the main rules for languages and units, and [0016](0016-fewer-languages.md)
the list of languages. Many smaller choices were made later, for the place names, the header and settings, the
warnings list and the weather details, each after comparing variants on mockups or fixing a bug found in use. This ADR
records, after the fact, the reasoning that used to live in `architecture.md`, which now describes only how these
parts work.

## Decision

- **Default language by base language, choice stored.** `de-AT` picks German; an explicit choice in the switcher wins,
  because the browser's list is only a guess.
- **No i18n library for now.** Typed files and `Intl` cover 8 languages; with many more languages, or translators
  working in a TMS, `i18next`/FormatJS with lazy-loaded JSON would be the next step.
- **Numbers and dates from `Intl`, not from strings,** so they are right for every locale, not only the translated
  ones.
- **Only place search takes `lang`,** because Open-Meteo returns city, region and country names in that language;
  everything else stays language-neutral so the cache is shared.
- **One digit system per screen.** Digits depend on the locale, not the language (`ar-EG` vs `ar`), so language files
  are functions of the formatters and every number, including `{n}` in plurals, uses the same `Intl.NumberFormat`.
  The bidi isolate around a temperature is needed because without it the degree sign drifts to the left of
  Arabic-Indic digits.
- **Right-to-left kept after the languages were cut.** The code still supports it (see 0016); the low–bar–high block of
  a day stays left to right so the cold-to-warm bar matches its labels.
- **Place names looked up by id in the UI language.** A name stored in the language it was searched in stayed "Warsaw"
  in a Russian UI. The id in a URL is untrusted (edited or stale link), so a name is used and an id saved only when the
  place is at the same coordinates (`withVerifiedId`). Ids above 32 bits are dropped early because Open-Meteo rejects
  them.
- **Buttons stay enabled while the id is checked, actions are `save`/`remove`.** Disabling them would make them
  flicker on every city opened, and a failed check must not block saving. A save that waited may find the city already
  saved (a click on a remounted button, another tab), and must not remove it then, so the actions are not toggles.
  Clicks run in order so a removal clicked after a save is not overtaken by it.
- **`dir="auto"` on place names.** A Latin name in a right-to-left UI inherited right-to-left and lost its beginning
  ("…gorzewo" instead of "Węgorze…"). Alignment and the warning mark use `[dir='rtl']` rules because the name's own
  direction would put them on the wrong side.
- **°F from the locale's region and the time zone together.** The region, not the language, decides (`en-GB` vs
  `en-US`). A page cannot read the system region; the time zone is the only other hint it gets without asking.
- **Temperatures converted on the client, converted then rounded.** Asking Open-Meteo for °F would double cache keys
  and provider requests for the same place, and a cached forecast could not be re-shown in the other unit. Rounding
  first is off by a degree (14.4 °C is 58 °F; 14 °C gives 57 °F). Differences ("4° warmer") are computed on converted
  values so they have no +32 offset.
- **No unit letter on "14°", wind unit separate.** As in most weather apps; the unit is in the settings. Many people
  mix units (°C with mph in the UK), so wind would get its own setting if needed.
- **Logo with the name as the way home.** Before, the only way back was the browser's, and none at all after opening a
  shared city link. Most sites link the logo to the start page (yr.no, AccuWeather, weather.com; Google puts its logo
  left of the search). The icon on a blue tile matches the Home Screen icon once installed. It has no frame because it
  is a logo, not a control. The start page stays: it is the entry point for a first visit and the overview of several
  saved cities, which the strip on a city page only abbreviates.
- **Settings behind a gear.** The two switches took a line of their own on a phone; behind a gear the header is one
  line. The gear is recognised in any language, which matters for someone landing in one they don't read. A disclosure,
  not an ARIA menu, because the panel holds a row and a switch and normal Tab order fits. °C/°F is a switch since two
  values need no list; rows with an arrow leave room for units with more values. Pop-up panels are pale blue because
  white glared on the blue page.
- **A warnings list in the settings, besides the bell.** The bell stays because turning on is one tap where people
  look. Before, a place turned on and never saved could only be turned off by finding it again. A place switched off
  stays until the menu closes so rows don't jump and the same switch turns it back on with its settings. `aria-disabled`
  instead of `disabled` keeps keyboard focus on the switch. "No data from MeteoAlarm" replaces "No warnings", which read
  as "all calm right now"; the coverage line exists because Minsk without warnings looked like a bug. The time zone is
  read after the permission prompt because Safari shows the prompt only straight from a click.
- **Own listbox instead of a native `<select>`.** On macOS a native select opens over the field with the selected
  option on it, so the list grew upwards for anything but the first option. The listbox reproduces what the select gave
  for free (scrolling, type-ahead); names carry `lang` so screen readers pronounce them.
- **Details as tiles below the 10-day forecast.** The top of the page is "now and the next days"; details are for those
  who scroll, like Apple Weather. Tiles fit more (wind direction and gusts, millimetres). Outline only, because a fill
  on the blue background drops soft text below 4.5:1.
- **Every detail opens its chart in place, one at a time, one shared arrow.** Numbers and their charts stay together.
  Once every item expands, one sign means one action, so air quality's "⋯" became the arrow. The open label turns full
  white because the soft label colour would fall below 4.5:1 on the lighter fill.
- **No confirmation, large hit area, scroll into view.** An accidental tap only opens a panel that another tap closes.
  The targets met WCAG 2.5.8's 24 px but not Apple's and Google's 44–48 px (26 px tall, "8°" 34 px wide), so the hit
  area covers the whole item. A panel opened below the screen looked like nothing happened, so opening scrolls it into
  view; reserving the chart's height first makes the scroll land right.
- **Pollutants as bars against WHO guidelines, panel as tall as a chart.** Switching details used to move the page
  below by ~90 px. A bar with the guideline mark makes "19 µg/m³" read as "above the guideline" without knowing the
  numbers. It compares the current hour with a daily guideline, a guide rather than a measurement over the same period,
  hence "daily guideline" in the label.
- **"Feels like" belongs to the temperature, not to the details.** It qualifies the temperature, as in Apple's and
  Google's weather, and its chart mostly repeated the hourly strip; that left four details, one row on a computer. A
  first version (small caption under the number) read as a footnote, and four lines of different sizes with equal gaps
  read as one column; the current layout (variant A of three) uses one size and step for the details. At 0.9rem in the
  soft colour they were hard to read, so they got 0.95rem and `--ink-detail` (variant E of five).
- **No chance-of-rain line under the condition.** Moving the details down took the chance of rain off the first screen;
  a line ("60% chance of rain from 6 PM") said it until the hourly strip showed the chance under each likely hour, and
  then it only repeated it.
- **Eight tiles, each explained in words.** The dew point is inside the humidity tile because it explains the humidity
  and a ninth tile would sit alone in a row. Dew point is a better "muggy" than relative humidity; "fresh", not "dry",
  because "dry air" next to "74%" read as a mistake. Pressure shows the trend because falling pressure is what people
  read a barometer for.
- **New forecast fields optional in the contract.** Cached answers from before a field existed lack it, and client and
  server deploy separately, so a missing value is a gap and the detail falls back to a plain value.
- **Plain SVG charts.** A line or bars over 24 points needs ~150 lines, while Recharts would nearly double the bundle.
  One series and one axis per chart means no legend and never two scales on one picture. Wind starts at zero so a
  breeze does not look like a storm; temperature is at least 4° tall so a flat day stays flat; values are unrounded
  because whole degrees made stairs. The chart measures its own width so text keeps its size on phones. A tapped hour
  stays shown because a finger has no hover and `pointerleave` follows the tap at once. The screen-reader table is
  hidden through a wrapper `div` because a table ignores `height: 1px`: it grew to ~700 px and opening a chart near the
  bottom scrolled far past it.

## Consequences

- An American travelling in Europe sees °C until they switch.
- The chosen language is not visible while the settings panel is closed.
- The logo line costs about 46 px of height on a phone.
- The language list is our own code for what the browser did before, in exchange for the same look and behaviour in
  every browser.
- The chance of rain is no longer a line on the first screen; it is in the hourly strip.
- The tiles cost 25 strings per language and tested rules in shared.
- Visibility and pressure are in km and hPa everywhere; imperial units are not done.
- A place found by location without an id keeps the name in the language it was found in.

## Alternatives considered

- **i18next or FormatJS now:** more than 8 typed files need (see also 0008).
- **°F from the locale alone:** wrong for a common case: `en-US` is the default English of many browsers, and Safari on
  a Mac reports it whatever the system region, so a reader in Warsaw got °F.
- **°F from Open-Meteo:** doubles cache keys and provider calls.
- **Disabling Save/Remove until the id is checked:** flicker on every city, and a failed check would block saving.
- **`text-align: match-parent` for names in another script:** did not right-align them in Chrome.
- **Way home:** the icon alone left of the search, bare and then on a blue tile with a "Home" tooltip (without its name
  it read as a control nobody knew the purpose of); a house button; the logo combined with a house; "Home" written in a
  button; a "‹ All cities" link; a house tile in the favourites strip; the name left of the search (narrowed the
  search).
- **Settings:** language codes on the buttons ("RU", with a globe or "文A"); the language in the footer; one "RU · °C"
  button; a menu like yr.no's.
- **Warnings list:** removing at once with "Undo"; a "Recently turned off" section; a cross with a confirmation; two
  sections ("Saved" / "Other cities"); on-first ordering for saved cities; the rule in two paragraphs up top.
- **Native `<select>` for languages:** grows upwards on macOS.
- **Where the charts open:** tabs above the hourly strip (a fourth "Hours" tab would hide the charts by default and
  separate numbers from charts); a "Charts ▾" menu after air quality (two similar controls side by side, an extra step,
  a menu pattern to build); a section under the 10-day list (long page, repeats the list).
- **Details placement:** tiles below the 10 days in addition to the row on top (wind, humidity, precipitation twice);
  keeping the row on top (Google's choice).
- **Air quality panel:** padding to chart height with empty space (looks unfinished); a 24-hour AQI chart for now
  (needs hourly air quality data, and would be taller).
- **"Feels like" and the summary lines:** two even lines (the second wraps on a phone in Russian); a column beside the
  number (too narrow on a phone); details at 1rem (too close to the 1.1rem condition line, the order blurred); only a
  brighter colour (tried first, still small); bright numbers in soft words (busier).
- **Dew point as a ninth tile:** would leave one tile alone in a row.
- **Recharts:** nearly doubles the bundle.
