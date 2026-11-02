# 0028. Current location: geolocation, naming and IP fallback details

- Status: Accepted
- Date: 2026-11-02

## Context

[0013](0013-current-location.md) sets the main rules: location only on request, named with Nominatim and matched to a
searched city, an IP guess when the browser fails. This record holds the details: duplicate cities, cached answers,
macOS failing to locate, and the providers' terms; `architecture.md` describes only how current location works.

## Decision

- **Only on demand, low accuracy.** A permission prompt on page load comes before the visitor has seen the page, a
  refusal can't be asked again, and Chrome hides such prompts. City level is enough, and `enableHighAccuracy: false` is faster and uses less battery.
- **One position request.** Chrome on a Mac sometimes answers `kCLErrorLocationUnknown` (code 2) for a while even with
  location services on. Retries within one request, watching the position and high accuracy were tried and did not
  help while it lasted; it is a system state (the same code worked again later). So the error message offers "Try
  again" and a city guessed from the IP address instead.
- **The IP guess is offered, not opened, and never after a refusal.** Behind a VPN or an office proxy it can be another
  city. Guessing after a "no"
  would go around the user's refusal. The guess goes through `PlaceService` so it is the same Warsaw as from search, and
  a saved one wins on the client. The answer depends on who asks, so it is `private, no-store`.
- **ipwho.is for the IP guess:** HTTPS, no key, low non-commercial traffic; behind `IpLocator` so it can be swapped.
  Its quota and rate-limit errors come in the body (`success: false`), not as HTTP errors, so only "can't place this
  address" is cached; caching anything else would pin an error.
- **`trust proxy` set to the number of proxies, not "trust all".** Trusting `X-Forwarded-For` from anyone would let a
  client fake its address.
- **Self-lookup only with `IP_SELF_LOOKUP=1`.** Opt-in rather than "unless `NODE_ENV` is production": a server where
  nobody set `NODE_ENV` and the proxy setting is wrong would otherwise offer its data centre's city to every user.
- **Nominatim behind its own `ReverseGeocoder` interface.** Open-Meteo has no reverse geocoding. Nominatim is free and
  names places in any language. Its policy (1 request a second, identifying `User-Agent`, attribution) is met by
  spacing in the adapter, a 7-day cache and the footer credit. Refusing a request that would wait more than 3 s keeps a
  burst of uncached requests from delaying everyone; the client gives up on the name after 4 s anyway. Heavy traffic
  would need a paid geocoder or an own Nominatim, i.e. another `ReverseGeocoder`.
- **The position becomes the nearest searched city within 25 km.** Places are identified by coordinates rounded to
  ~1 km, so the user's own cell (52.25,21.05) was a different place from Warsaw saved from search (52.23,21.01): its
  page showed "Save", and saving added Warsaw a second time. Returning the city's coordinates and id makes it exactly
  what search gives, and the id lets the name follow the UI language. The forecast is for the city centre, a few km
  away, which is what the page's name says anyway.
- **A fallback forced by an error is not cached.** If search fails, the position is returned but not cached and sent
  `no-store`: otherwise it would pin the unmatched place for everyone nearby for a week (errors are never cached). The
  client cache keeps only final answers for the same reason.
- **A saved city wins on the client (`findSavedCity`).** The server match alone did not stop the duplicate for a real
  user: an answer from before the match was still in the browser's HTTP cache, and a city saved earlier from the
  user's own position has their coordinates, not the centre's. The client check needs neither the server nor the
  cache, and costs no request.
- **A late answer is dropped.** A lookup can take long (the permission prompt waits for the user, then the position,
  then the name); its answer must not take the user away from a city they chose meanwhile.
- **Responses are checked (`toFoundPlace`), and a shape change gets a new URL.** When `/api/reverse` started returning
  coordinates, browsers still had the old name-only answer cached for a day, and the page crashed on the missing
  coordinates. Tolerating the old answer was not enough: it has no id, so a saved city named in another language
  ("Варшава" saved, "Warsaw" found) still looked new and the page offered "Save" again. So the endpoint moved from
  `/api/reverse` to `/api/places/reverse`, and old cached answers are never asked for again. General lesson for a long
  `max-age`: a change of a response's shape must stay backward compatible (clients tolerate missing fields) or get a
  new URL (API versioning, `/api/v1`, see [0012](0012-api-versioning.md)), because cached old answers outlive a
  deploy.
- **"You are here" in `sessionStorage`, not a URL flag:** a shared link would tell the recipient they are there.

## Consequences

- Two external services (Nominatim, ipwho.is) with their own limits; heavy traffic needs another geocoder.
- The IP guess can be wrong behind a VPN or proxy; the page marks it "Approximate, by IP".
- On macOS the browser may fail to locate for a while; the user gets "Try again" and the IP guess.
- A place unknown to search has no id and keeps its name in the language it was found in.

## Alternatives considered

- **Asking for location on page load:** see above.
- **A "Near you" card on the start page** (local weather at once if location was allowed before, via the Permissions
  API, a button otherwise): built and removed; it sat among the saved cities without being one, and the crosshair
  covers the need from any page.
- **Local weather by IP for everyone on the first visit:** wrong behind VPNs and office proxies, and it happens without
  the user asking.
- **Retrying, watching the position or high accuracy on `kCLErrorLocationUnknown`:** did not help.
- **Opening the IP-guessed city directly:** may be another city.
- **Trusting `X-Forwarded-For` from anyone:** lets a client fake its address.
- **Self-lookup unless `NODE_ENV` is production:** unsafe when `NODE_ENV` is unset.
- **Relying only on the server match to avoid duplicates:** cached old answers and cities saved from a raw position
  still duplicated.
- **Only tolerating the old `/api/reverse` answer:** no id, so duplicates in another language.
