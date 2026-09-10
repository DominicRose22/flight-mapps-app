# Border Route

A Google Maps style journey planner. Type a starting point and a destination, pick a
mode — drive, walk, transit, or flight — and get a route. Flight mode searches real
(sandbox) fares via Duffel and links out to Skyscanner to book.

## What's here

```
flight-maps-app/
├── server.js          Express backend — proxies flight search to Duffel
├── package.json
├── .env.example        Copy to .env and add your Duffel key
└── public/
    ├── index.html      Full-screen map + floating search bar
    ├── styles.css
    └── app.js          Map logic, routing, flight search, Skyscanner link
```

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Get a Duffel test API key**
   Sign up at [app.duffel.com](https://app.duffel.com), switch to "developer test mode,"
   and create an access token (starts with `duffel_test_`). Copy `.env.example` to `.env`
   and paste it in.

3. **Get a Google Maps API key**
   In the [Google Cloud Console](https://console.cloud.google.com/google/maps-apis),
   create a key with the **Maps JavaScript API**, **Places API**, and **Directions API**
   enabled. Paste it into `CONFIG.GOOGLE_MAPS_API_KEY` at the top of
   `public/index.html`. Restrict the key to your domain before this goes live.

4. **Run it**
   ```
   npm start
   ```
   Open `http://localhost:3000`.

## How it works

- **Drive / walk / transit** modes call Google's Directions API directly from the
  browser and draw the route on the map, exactly like Maps' own transit view.
- **Flight** mode does two things: your browser asks the Express backend for flight
  offers (so the Duffel key never reaches the browser), and each result gets a
  "Find on Skyscanner" button linking to a live Skyscanner search for that route
  and date, so booking happens on Skyscanner itself.
- "Availability" is answered honestly: an offer only appears if Duffel could find
  a fare for the number of passengers you searched for. There's no numeric
  "3 seats left" counter — most flight APIs, Duffel included, don't expose exact
  seat counts — but a returned offer means that many seats really are bookable.

## Known limitations to fix before shipping

- **Airport lookup is a hardcoded list** (`AIRPORT_LOOKUP` in `app.js`) covering a
  handful of cities for demo purposes. Replace it with a real nearest-airport
  lookup (e.g. a static airports dataset keyed by lat/lng distance) so any two
  places in the world resolve correctly.
- **Duffel test mode returns sandbox data**, mostly from Duffel's own test
  airline ("Duffel Airways"), not real live fares. Switch `DUFFEL_API_KEY` to a
  live key once you're ready to launch, and go through Duffel's onboarding for
  live access.
- **No error handling for partial itineraries** yet, e.g. what happens if there's
  a valid ground route but no flights, or vice versa — currently each mode is
  computed independently rather than as one combined multi-leg trip.
- **The flight line on the map is a straight dashed line**, not an accurate
  flight path — fine for a demo, but a real great-circle arc would look better
  over long distances.
- **No caching or rate limiting** on `/api/flights` — add both before any real
  traffic, since each search is a live call to Duffel.
