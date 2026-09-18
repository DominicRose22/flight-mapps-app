// ---------- state ----------
let map, geocoder, directionsService, directionsRenderer, flightLine;
let currentMode = "driving";
let originPlace = "";
let destinationPlace = "";

const modeRow = document.getElementById("mode-row");
const dateRow = document.getElementById("date-row");
const sheetContent = document.getElementById("sheet-content");
const toastEl = document.getElementById("toast");
const originInput = document.getElementById("origin-input");
const destinationInput = document.getElementById("destination-input");

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  setTimeout(() => toastEl.classList.remove("visible"), 3200);
}

// ---------- Google Maps bootstrap ----------
// Called automatically once the Maps script (loaded below) is ready.
window.initMap = function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 50.0, lng: 5.0 },
    zoom: 5,
    disableDefaultUI: true,
    zoomControl: true,
  });

  geocoder = new google.maps.Geocoder();
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ map, suppressMarkers: false });

  const autocompleteOptions = { fields: ["formatted_address", "geometry", "name"] };
  const originAutocomplete = new google.maps.places.Autocomplete(originInput, autocompleteOptions);
  const destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput, autocompleteOptions);

  originAutocomplete.addListener("place_changed", () => {
    const place = originAutocomplete.getPlace();
    originPlace = place.formatted_address || place.name || originInput.value;
    maybeRoute();
  });

  destinationAutocomplete.addListener("place_changed", () => {
    const place = destinationAutocomplete.getPlace();
    destinationPlace = place.formatted_address || place.name || destinationInput.value;
    maybeRoute();
  });
};

// Inject the Maps script using the key from CONFIG, defined in index.html.
(function loadGoogleMaps() {
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.GOOGLE_MAPS_API_KEY}&libraries=places&callback=initMap`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
})();

// ---------- mode switching ----------
modeRow.addEventListener("click", (event) => {
  const button = event.target.closest(".mode-pill");
  if (!button) return;

  currentMode = button.dataset.mode;
  [...modeRow.children].forEach((el) => el.classList.toggle("active", el === button));
  dateRow.classList.toggle("visible", currentMode === "flight");

  maybeRoute();
});

// Default a sensible departure date (tomorrow) so the date field isn't empty.
(function setDefaultDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById("depart-date").value = tomorrow.toISOString().slice(0, 10);
})();

function maybeRoute() {
  if (!originPlace || !destinationPlace) return;
  if (currentMode === "flight") {
    computeFlightRoute();
  } else {
    computeGroundRoute();
  }
}

// ---------- ground routing (car / walk / transit) ----------
function computeGroundRoute() {
  clearFlightOverlay();
  directionsRenderer.setMap(map);

  directionsService.route(
    {
      origin: originPlace,
      destination: destinationPlace,
      travelMode: google.maps.TravelMode[currentMode.toUpperCase()],
    },
    (result, status) => {
      if (status !== "OK") {
        showToast(`Couldn't find a ${currentMode} route between those two places.`);
        updatePillLabel(currentMode, "--");
        renderEmptySheet(`No ${currentMode} route is available for this pair of places.`);
        return;
      }

      directionsRenderer.setDirections(result);

      const leg = result.routes[0].legs[0];
      updatePillLabel(currentMode, leg.duration.text);
      renderGroundSheet(leg);
    }
  );
}

function renderGroundSheet(leg) {
  sheetContent.innerHTML = `
    <div class="summary-card">
      <div class="summary-title">${originPlace} → ${destinationPlace}</div>
      <div>${leg.distance.text} · ${leg.duration.text}</div>
    </div>
  `;
}

// ---------- flight routing ----------
async function computeFlightRoute() {
  directionsRenderer.setMap(null);

  const date = document.getElementById("depart-date").value;
  sheetContent.innerHTML = `<p class="sheet-empty">Searching flights…</p>`;

  try {
    const response = await fetch(
      `${CONFIG.BACKEND_URL}/api/flights?origin=${encodeURIComponent(originPlace)}&destination=${encodeURIComponent(destinationPlace)}&date=${date}`
    );

    if (response.status === 404) {
      renderEmptySheet("Couldn't find an airport near one of those places — try a bigger nearby city.");
      updatePillLabel("flight", "--");
      return;
    }

    if (!response.ok) throw new Error("Backend returned an error");
    const data = await response.json();

    if (!data.offers || data.offers.length === 0) {
      renderEmptySheet("No flights came back for that route and date.");
      updatePillLabel("flight", "--");
      return;
    }

    drawFlightOverlay(data.origin, data.destination);
    updatePillLabel("flight", data.offers[0].duration || "flights");
    renderFlightSheet(data.origin, data.destination, date, data.offers);
  } catch (err) {
    console.error(err);
    renderEmptySheet(
      "Couldn't reach the flights backend. Make sure server.js is running (see README)."
    );
  }
}

function renderFlightSheet(originAirport, destinationAirport, date, offers) {
  const cards = offers
    .map((offer) => {
      const bookingUrl = buildSkyscannerLink(originAirport.iata, destinationAirport.iata, date);
      return `
        <div class="leg-card">
          <div class="leg-title">
            <span>${offer.airline}</span>
            <span class="leg-price">${offer.price}</span>
          </div>
          <div class="leg-sub">${offer.departure} → ${offer.arrival} · ${offer.duration} · ${offer.availability}</div>
          <a class="book-link" href="${bookingUrl}" target="_blank" rel="noopener">Find on Skyscanner</a>
        </div>
      `;
    })
    .join("");

  sheetContent.innerHTML = `
    <div class="summary-card">
      <div class="summary-title">${originAirport.name} → ${destinationAirport.name}</div>
      <div>${date} · ${offers.length} option${offers.length === 1 ? "" : "s"} found</div>
    </div>
    ${cards}
  `;
}

function renderEmptySheet(message) {
  sheetContent.innerHTML = `<p class="sheet-empty">${message}</p>`;
}

function updatePillLabel(mode, text) {
  const pill = modeRow.querySelector(`[data-mode="${mode}"] .label`);
  if (pill) pill.textContent = text;
}

// A great-circle-ish curve isn't necessary for a demo — a straight dashed
// line communicates "this leg is a flight, not a road" well enough.
function drawFlightOverlay(originAirport, destinationAirport) {
  clearFlightOverlay();

  const bounds = new google.maps.LatLngBounds();
  const points = [originPlace, destinationPlace];

  Promise.all(points.map((address) => geocodeAddress(address))).then(([originLatLng, destLatLng]) => {
    if (!originLatLng || !destLatLng) return;

    flightLine = new google.maps.Polyline({
      path: [originLatLng, destLatLng],
      geodesic: true,
      strokeColor: "#0c447c",
      strokeOpacity: 0,
      icons: [
        {
          icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
          offset: "0",
          repeat: "14px",
        },
      ],
      map,
    });

    bounds.extend(originLatLng);
    bounds.extend(destLatLng);
    map.fitBounds(bounds, 80);
  });
}

function clearFlightOverlay() {
  if (flightLine) {
    flightLine.setMap(null);
    flightLine = null;
  }
}

function geocodeAddress(address) {
  return new Promise((resolve) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results[0]) {
        resolve(results[0].geometry.location);
      } else {
        resolve(null);
      }
    });
  });
}

// ---------- Skyscanner deep link ----------
// Skyscanner's public search URL format. This just points a person at
// live search results on skyscanner.net; it does not need an API key.
function buildSkyscannerLink(originIata, destIata, date) {
  const compactDate = date.replace(/-/g, "").slice(2); // YYMMDD
  return `https://www.skyscanner.net/transport/flights/${originIata.toLowerCase()}/${destIata.toLowerCase()}/${compactDate}/`;
}
