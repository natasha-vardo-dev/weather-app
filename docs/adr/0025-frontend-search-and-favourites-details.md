# 0025. Frontend details: links, styles, loading, same-named places and favourites

- Status: Accepted
- Date: 2026-11-02

## Context

This record holds the smaller decisions about the client ("Frontend", "Same-named places in search", "Favourites" and
the page layout); `docs/architecture.md` describes only how these parts work. The larger decisions
have their own ADRs: links by id ([0006](0006-place-urls-by-id.md)), favourites in the browser
([0007](0007-favourites-in-browser.md)), fewer languages ([0016](0016-fewer-languages.md)).

The forces behind these smaller choices:

- The site must work for readers of every supported language, on phones, offline and with screen readers.
- Every request to Open-Meteo counts against a per-IP daily quota ([0004](0004-provider-limits.md)).
- GeoNames (behind Open-Meteo's search) lists many places with the same name: a search for "Rhodes" returned two
  identical lines, the town and the island (same region and country, their points 33 km apart, the island's in its
  mountainous middle); two saved Józefów looked the same on the page and in favourites, since only name, country,
  coordinates and id were kept.
- Each feature costs code, a text in every language and tests (CLAUDE.md: "first the benefit").

## Decision

- **Links by GeoNames id, slug in plain Latin.** Open-Meteo's location ids are GeoNames ids, the same ones yr.no uses,
  so links are not tied to the weather provider and survive a change of it. A Latin slug from the English name gives
  one address for every reader that does not turn into `%D0%92…` when copied. The coordinates are taken from any
  successful lookup of the id in any language, so switching the language never takes the forecast away while the new
  language's lookup runs or fails offline. Places without an id keep their name in the query because nothing else
  knows it.
- **Plain global CSS, one file per part, ordered imports.** The import order is the cascade. Each file ends with its own
  reduced-motion overrides: in one shared block in the middle of the old single stylesheet they lost to transitions
  declared further down (the bell's switch and the warnings' chevrons kept animating).
- **Own weather icons.** A hand-drawn set of ten filled two-colour SVGs. `shared` names only the icon kind, so a React
  Native app can map the same kinds to its own images.
- **Title and focus set by the app.** The browser does not treat SPA navigation as a new page, so screen reader and
  keyboard users would otherwise not notice the change.
- **A 15-second limit on every request, built by hand.** A request stalled on a weak signal used to keep the page's
  placeholder up until the browser gave up, which takes minutes. `AbortSignal.timeout`/`any` are missing in older
  Safari and in React Native.
- **A shared in-memory query cache.** Without it, switching cities briefly replaced the page with a loading line and the
  layout jumped. The page-shaped placeholder, the kept air quality slot and `scrollbar-gutter: stable` serve the same
  goal: no jumping layout.
- **Reload on return, not on a timer.** An installed app is often resumed rather than reloaded, and showed yesterday's
  weather in the morning. Reloading sooner than the server keeps the data (15 minutes, an hour) would get the same
  answer. Warnings, which must not lag, are the only thing refreshed on a timer.
- **Same-named places told apart by the level that differs.** In search, an island mark and the first differing admin
  level; on the page, district and region; in favourites, the first differing level for namesakes only. Most lists do
  not get longer, and nothing needs per-language word lists.
- **The island word on the country line** in the heading and on tiles ("island · Greece"): on a narrow tile
  "Rhodes · island" was cut to "Rhodes · …", losing exactly the difference, and in the large heading it read as part
  of the name. Search keeps matching old and other names: the same matching that finds Esmond, North Dakota for
  "rhodes" finds Kyiv for "Kiev".
- **Twins in search get the first differing level, not always admin2.** The first version added only admin2, the
  province; two villages "Rode" share their province and district, so the lines stayed identical.
- **District and region rules on the page.** The district is left out when it is the city itself because it repeats
  the name; the fuzzy comparison exists because in English the provider names the city "Warsaw" but its district
  "Warszawa", which showed "Warszawa · Mazovia" under "Warsaw". Being the difference, a district is shown even
  untranslated. The provider sends the English region name when it has no translation ("South Aegean" in Russian);
  in a non-Latin interface it would be shown in another alphabet, so it is dropped. In a Latin-script interface an
  English fallback cannot be told from a translation, so it stays. There is no list of region names to translate them
  ourselves; `Intl.DisplayNames` covers countries only. Each part stays whole so a wrapped line does not leave the
  last word alone. A long single-word name breaks inside the word because otherwise it widened the page into a
  sideways scroll on phones.
- **Common words dropped in favourites, namesakes matched in any form.** Without dropping, a narrow tile cut both
  "Województwo mazowieckie" and "Województwo lubelskie" to "Województw…". A language may name one Józefów and not the
  other (in Russian the town is "Юзефув", a village keeps "Józefów"), so the interface name, the English name and the
  saved name are all compared. Places saved without an id get no English alias: a second search would cost the
  provider's quota.
- **"You are here" as plain text.** The earlier 24 px pill sat centred above the text and looked like the buttons
  beside it. On a phone the mark moves under the district and region line because under the country it made the
  column beside the buttons four lines tall. It is drawn twice so screen readers hear it with the name while the
  visible copy is not read twice.
- **Header buttons: star icon, then bell.** In the first version only "Save" kept its label and the home city and the
  bell were 36 px round icon buttons with hidden names and tooltips; in Russian and German the labels pushed the
  buttons onto a second line ("Save" and "Saved" shared one grid cell, the inactive one invisible, so the button kept
  one width). Tooltips use CSS from `data-tip`, not `title`, which appears late, only for the mouse, and is read twice.
  On phones the country goes under the name so the name and the buttons share a line. The star is the sign of
  favourites everywhere.
- **One word, "favourites".** The section was "Favourites" while the star said "Save" / "Saved" and the warnings list
  "Saved cities", which read as two different things. The star's hidden name says what pressing does, so no
  `aria-pressed`. Changed in every language supported then (Chinese was already consistent).
- **Day column as wide as the longest day name.** A fixed 3.5rem left "Сегодня" touching the icon and put
  "Aujourd'hui" 18 px over it; a wider fixed column would leave "Thu" far from its icon. Checked in all 19 languages
  supported then (28–86 px) and on a phone. Today's background is a pseudo-element because padding on a subgrid row
  would shift its columns.
- **Page polish.** Several warnings collapse to the most severe one: four cards took half a phone screen, and the first
  is always the most severe and soonest, so nothing urgent is folded. The chance of rain shares one fixed-height slot
  with the icon so the strip keeps one height (an empty row that came and went is why it was dropped at first); a dry
  hour's icon sits in the middle, as in Apple Weather, at the cost of icons not on one line.
- **Weather icon after the current temperature.** Variant A of four mockups (1 November 2026):
  after the number, centred and sized from its font, so the weather reads at a glance with the number. It is
  decorative because the condition is the next line. History: an icon was tried before, then after the number, and
  removed (the number led alone, the condition written below, the strip and the list having icons) before this.
- **Full favourites list blocks saving with a short message.** Silently dropping a city would lose it. The star keeps
  its look because a full list is no concern until someone tries to add a city. Two lines rather than one sentence,
  as the full stop between them differs by language; a live region so screen readers announce it. Before, a hint sat
  in the row of buttons with a dashed star on every page while the list was full.
- **Storage work as plain functions** (`favoritesStore.ts`) so its rules are unit-tested with a stubbed `localStorage`
  and the hook stays thin; the rules in `shared` can be reused by a React Native app with its own storage.
- **The favourites strip keeps the open city**, highlighted, so tiles never move when switching; it is the same on
  every screen size.
- **No home city, no pinning, newest first.** With at most 10 saved cities, all visible at once, either added a second
  concept and a button on every city page for little gain, and the row by the name is shorter without it. "My city
  first" is better met by geolocation (the crosshair in the search field).
- **On phones the greeting sits right under the search**, with the page's usual spacing (2026-11-02, one of four
  mockups). The 12vh gap above it left an empty band under the search bar on a small screen and pushed
  favourites down by about 100 px. Only the gap goes, so it is one CSS rule with nothing to translate; on wider screens,
  where the gap balances the large greeting, it stays.

## Consequences

- One link per city for every language; a city that is not saved waits for one id lookup (usually cached) before its
  forecast starts ([0006](0006-place-urls-by-id.md)).
- Global CSS relies on distinct class prefixes per component to avoid collisions.
- A page left on screen for hours (a wall display) is refreshed only when it comes back into view or reconnects.
- In Latin-script interfaces a region may show in English when the provider has no translation.
- Older cached `/api/v1/locations/:id` answers (a day) show no island mark or levels until they expire; the fields are
  optional, so nothing breaks.

## Alternatives considered

- **Coordinates plus the localised name in every link** (the former form, `?name=Варшава&country=Польша`): shown until
  the id lookup translated it, and kept for good for places without an id; one link per language. Replaced by
  [0006](0006-place-urls-by-id.md).
- **CSS Modules:** they scope class names, but would mean renaming every class in the components and the tests, and the
  right-to-left rules (`[dir='rtl'] .x`) would need `:global`; for one app with distinct prefixes per component the
  collision risk does not justify it.
- **One shared reduced-motion block:** lost to transitions declared later (above).
- **An icon library such as `lucide-react`:** outline-only, and filling the icons breaks rain, snow and storm; ten
  icons do not justify a dependency.
- **A refresh timer while the page is in view:** helps only a page left on screen for hours, which would keep its place
  fresh all day at about 235 Open-Meteo calls (2% of the daily quota) whether anyone looks or not. Revisit if people
  ask for a display mode.
- **Dropping islands from search:** then "Crete" or "Sicily" find nothing.
- **"Island of Rhodes" in the heading:** word order and form differ in every language (19 templates at the time). **A
  small boxed label:** looks like a button.
- **"You are here" as the pin alone:** unclear without the word, and phones have no hover. **A smaller pill:** still a
  button lookalike.
- **Header buttons:** icons only with no label anywhere (a bare star was then thought unclear, and phones have no
  hover tooltips); a star plus a "⋯" menu (hides home city and warnings, and whether notifications are on); the
  buttons on their own row (40 px more before the temperature).
- **Greeting on phones:** above the search, between the logo and the field (the subline reads as a hint for the field,
  but the heading would have to move into the header's markup, and the search drops below the first glance); a smaller
  heading with the subline right under it (denser, but the greeting loses its weight for little extra room); the
  current gap.
- **"Saved" everywhere, as Google Maps does:** a star reads as favourites, and the section already had that name.
- **Weather icon placement:** a small icon before the condition (adds little next to the word); a large one at the
  block's right edge (runs into three-character temperatures such as −12° on a phone); one above the number (pushes
  the hourly strip down a line).
- **Full-list feedback:** a link to the favourites in the message (tried and dropped); a "10" badge on the star, a line
  under the name, a notice in the page flow (compared on mockups); the earlier always-visible hint with a dashed star.
- **A home city** ("⌂ Home" next to the star, first in the strip and cards, stored in `home-city:v1`): built and
  removed. Before it, opening the app straight on the home city (`/` redirecting to it, cards
  moved to `/favourites`) was tried and dropped: it needed an extra "All favourites" link and made `/` mean different
  things to different people.
- **Pinning** (pinned cities first): prototyped and removed for the same reason as the home city.
- **One forecast request per saved city** (the first version): replaced by a batch request.
- **Deferred:** a two-column layout on wide screens.
