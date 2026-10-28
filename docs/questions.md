# Open questions

Assumptions made while building, and who could confirm them.

## Weather warnings

- **Licence of MeteoAlarm's region borders.** The warnings come from MeteoAlarm feeds, published under terms equivalent to CC BY 4.0 with extra conditions (texts unmodified, "EUMETNET – MeteoAlarm" credited with a link, at most 10 minutes' delay). The region borders used to place a city in a warning area (`MeteoAlarm_Geocodes_2026_07_31.json` in MeteoAlarm's public GitLab repository `meteoalarm-pm-group/documents`) carry no licence of their own. Assumed: the same terms as the rest of MeteoAlarm's data, since MeteoAlarm publishes the file for re-users. To confirm with meteoalarm@geosphere.at before a real release.
- **The Atom feeds' future.** MeteoAlarm's API portal lists them as being "for existing integrations"; the newer MeteoGate API has no lookup by coordinates and returns only country-wide lists of boxes (checked on 27 Oct 2026). If the feeds are retired, the adapter moves to MeteoGate with a key; the rest of the app does not change.
