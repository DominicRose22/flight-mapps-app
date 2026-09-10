require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY;
const DUFFEL_BASE_URL = "https://api.duffel.com";

if (!DUFFEL_API_KEY) {
  console.warn(
    "Warning: DUFFEL_API_KEY is not set. Copy .env.example to .env and add your test key from app.duffel.com."
  );
}

app.use(cors());
app.use(express.static("public"));

// GET /api/flights?origin=LON&destination=VIE&date=2026-09-20&passengers=1
app.get("/api/flights", async (req, res) => {
  const { origin, destination, date, passengers = 1 } = req.query;

  if (!origin || !destination || !date) {
    return res.status(400).json({ error: "origin, destination and date are required" });
  }

  try {
    const offerRequestRes = await fetch(`${DUFFEL_BASE_URL}/air/offer_requests`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DUFFEL_API_KEY}`,
        "Content-Type": "application/json",
        "Duffel-Version": "v2",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          slices: [{ origin, destination, departure_date: date }],
          passengers: Array.from({ length: Number(passengers) }, () => ({ type: "adult" })),
          cabin_class: "economy",
        },
      }),
    });

    if (!offerRequestRes.ok) {
      const errorBody = await offerRequestRes.text();
      console.error("Duffel error:", errorBody);
      return res.status(502).json({ error: "Duffel offer request failed" });
    }

    const offerRequestData = await offerRequestRes.json();
    const offers = (offerRequestData.data.offers || []).slice(0, 8).map(formatOffer);

    res.json({ offers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

// Shape a raw Duffel offer into the small object the frontend renders.
// An offer only appears here if Duffel could actually seat the number of
// passengers requested, which is how "is there room" is answered.
function formatOffer(offer) {
  const firstSlice = offer.slices[0];
  const firstSegment = firstSlice.segments[0];
  const lastSegment = firstSlice.segments[firstSlice.segments.length - 1];

  return {
    airline: offer.owner?.name || "Unknown airline",
    departure: formatTime(firstSegment.departing_at),
    arrival: formatTime(lastSegment.arriving_at),
    duration: formatDuration(firstSlice.duration),
    price: `${offer.total_currency} ${offer.total_amount}`,
    availability: `Available for ${offer.passengers.length} passenger${offer.passengers.length === 1 ? "" : "s"}`,
    stops: firstSlice.segments.length - 1,
  };
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(isoDuration) {
  // Duffel returns ISO 8601 durations like "PT2H40M"
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return isoDuration;
  const hours = match[1] ? `${match[1]}h ` : "";
  const minutes = match[2] ? `${match[2]}m` : "";
  return `${hours}${minutes}`.trim();
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
