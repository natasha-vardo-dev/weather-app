import { usePageMeta } from '../hooks/usePageMeta';

/** Where to reach the person responsible (GDPR art. 13): the project's public issue tracker. */
const CONTACT_URL = 'https://github.com/natasha-vardo-dev/weather-app/issues';
const UPDATED = '31 October 2026';

/**
 * The privacy policy, in English only (a legal text in 8 draft translations would be worse
 * than one reviewed version). It must follow the code: a new service that receives anything
 * from the user, or new data kept, changes this page. See docs/architecture.md, "Privacy".
 * Loaded on demand, so it costs the rest of the app nothing.
 */
export function PrivacyPage() {
  usePageMeta('Privacy policy');

  return (
    <article className="legal" lang="en" dir="ltr">
      <h1 className="legal__title">Privacy policy</h1>
      <p className="legal__updated">Last updated: {UPDATED}</p>

      <p>
        This is a free, non-commercial weather app. It has no accounts, no advertising, no analytics and no cookies. It
        asks for as little as it needs to show the weather for the place you choose, and keeps almost nothing.
      </p>

      <h2>Who is responsible</h2>
      <p>
        The app is run by its author as a personal, non-commercial project. For any question about your data, or to
        exercise your rights, write through the{' '}
        <a href={CONTACT_URL} rel="noreferrer">
          project&apos;s issue tracker
        </a>
        .
      </p>

      <h2>What stays in your browser</h2>
      <p>
        These are stored only on your device, in the browser&apos;s storage for this site, and never sent to us as such.
        They exist because you asked for them, so no consent banner is needed. Clearing the site&apos;s data in your
        browser deletes them.
      </p>
      <ul>
        <li>your favourite places (up to 10), your language and your temperature unit;</li>
        <li>the last position you looked up with the locate button, for this browser tab only;</li>
        <li>
          the forecasts, air quality and place names you last loaded (up to 50, for a day), so the app can show them
          when you are offline;
        </li>
        <li>
          if you turn on warning notifications: the places and settings you chose, and the texts used to write
          notifications in your language.
        </li>
      </ul>

      <h2>What our server receives</h2>
      <ul>
        <li>
          <strong>Places you look at and searches you type.</strong> Our server asks the weather providers on your
          behalf, so they see our server, not you. Coordinates are rounded to about 1 km.
        </li>
        <li>
          <strong>Your IP address,</strong> as with any website. It is kept in memory for a minute to limit how many
          requests one address can make (and used once more in the location case below), and is not written to our logs.
          Our hosts (below) see it too.
        </li>
        <li>
          <strong>Error reports.</strong> If the app fails in your browser, it sends the error message and where in the
          app&apos;s code it happened, the kind of page (without the place), the app version and your browser&apos;s
          user agent. These go to our server logs.
        </li>
      </ul>
      <p>
        Our logs record each request&apos;s method, path (without the place or search words), status and duration, and
        are kept by our host for its usual short period. We keep no database of users.
      </p>

      <h2>Your location</h2>
      <p>
        Only when you press the locate button, and only if you allow it in your browser. The position is rounded to
        about 1 km in your browser before it is sent. Our server then asks OpenStreetMap&apos;s Nominatim service for
        the place&apos;s name; Nominatim sees our server, not you. If your browser cannot find your position, our server
        sends your IP address to ipwho.is to suggest a nearby city. The position found is kept in our server&apos;s
        memory for up to a day, filed under a one-way fingerprint of your address (not the address itself, and not
        traceable back to it), and is never written to disk. This is never done if you denied location access.
      </p>

      <h2>Warning notifications</h2>
      <p>
        Only if you turn them on. Your browser then registers with its push service and with Google&apos;s Firebase
        Cloud Messaging, which gives it a device token and receives your IP address while doing so. Our server
        subscribes that token to topics named after the warning areas of the places you chose (a region, not your
        position). We do not store the token; to limit how often one device can change its notifications, our server
        keeps a one-way hash of it in memory for an hour. Turning notifications off removes the subscriptions.
      </p>

      <h2>Who else processes data</h2>
      <ul>
        <li>Vercel (hosting of the site) and Render (hosting of our server): requests, including IP addresses.</li>
        <li>Open-Meteo: places and searches, from our server.</li>
        <li>OpenStreetMap Foundation (Nominatim): rounded positions, from our server.</li>
        <li>ipwho.is: your IP address, only in the case described above.</li>
        <li>Google (Firebase Cloud Messaging) and your browser&apos;s push service: only with notifications on.</li>
      </ul>
      <p>
        Vercel, Render and Google may process data in the United States, under the EU–US Data Privacy Framework or the
        European Commission&apos;s standard contractual clauses.
      </p>

      <h2>Legal basis</h2>
      <p>
        Showing the weather you ask for, keeping the service secure and within its providers&apos; limits, and fixing
        errors are our legitimate interests (GDPR art. 6(1)(f)). Your location and notifications are used only with your
        consent (art. 6(1)(a)), which you can withdraw at any time in your browser or the app&apos;s settings.
      </p>

      <h2>Your rights</h2>
      <p>
        You have the right to access, correct and delete your personal data, to restrict or object to its use, and to
        complain to your data protection authority. As we keep almost nothing that identifies you, most of it is in your
        own browser, where you can delete it yourself.
      </p>
    </article>
  );
}
