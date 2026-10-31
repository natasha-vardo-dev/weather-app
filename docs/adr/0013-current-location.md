# 0013. Location only on request, matched to a searched city

- Status: Accepted
- Date: 2026-10-31 (recorded)

## Context

"Weather where I am" is the most common wish, but a permission prompt on load is the first thing a new visitor would
see, browsers hide such prompts, and a refusal cannot be asked again. Open-Meteo has no reverse geocoding.

## Decision

- The browser's position is asked for only when the user presses the locate button in the search field. Coordinates
  are rounded to about 1 km at once; the precise position never reaches a URL, the server or logs.
- `GET /api/v1/places/reverse` names the position with OpenStreetMap Nominatim (one request a second, own `User-Agent`,
  attribution), then finds that name in Open-Meteo search and takes the nearest result within 25 km. The user gets
  the same city, with its id, as search would give, so a saved Warsaw is recognised as saved.
- When the browser cannot find the position, the message offers "Try again" and a city guessed from the IP address
  (ipwho.is). The city is suggested, not opened (a VPN may put it elsewhere), and never offered after the user denied
  location access.
- "You are here" is remembered in `sessionStorage`, not in the URL.

## Consequences

- Two more external services, each with its own limits and privacy note.
- A place with no matching city stays as coordinates and keeps the name in the language it was found in.

## Alternatives considered

- Asking on load, or a "Near you" card on the home page: built and removed.
- Weather by IP for everyone on the first visit: guesses where the user did not ask.
