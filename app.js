(() => {
    "use strict";

    const TOKEN = window.MAPILLARY_TOKEN || "";
    const TOTAL_ROUNDS = 5;
    const MAX_SCORE = 5000;
    const regions = [
        [-123.5, 37, -121.5, 39], [-74.3, 40.3, -73.5, 41.1],
        [-3.8, 40.2, -3.2, 40.7], [2.1, 48.7, 2.6, 49.1],
        [13.1, 52.3, 13.7, 52.7], [7.3, 46.8, 8.1, 47.6],
        [18.9, 59.1, 19.3, 59.5], [12.3, 41.7, 12.7, 42.1],
        [139.5, 35.5, 140.1, 35.9], [151, -34.1, 151.4, -33.7],
        [144.7, -38, 145.2, -37.5], [-58.7, -35, -58.2, -34.3],
        [-99.4, 19.2, -98.8, 19.7], [-47.1, -23.1, -46.4, -22.7],
        [28.8, -26.3, 29.2, -25.9], [30.8, 29.8, 31.4, 30.2]
    ];
    const state = { round: 1, total: 0, actual: null, guess: null, guessMarker: null, actualMarker: null, viewer: null, map: null };
    const $ = (selector) => document.querySelector(selector);
    const status = $("#status-banner");
    const roundLabel = $("#round-label");
    const totalscore = $("#total-score");
    const submitButton = $("#submit-guess");
    const nextButton = $("#next-round");
    const resultCard = $("#result-card");

    function setStatus(message, type = "") {
        status.textContent = message;
        status.className = `status-banner ${type}`;
    }

    function updateHeader() {
        roundLabel.textContent = `Round $(state.round) / ${TOTAL_ROUNDS}`;
        totalScore.textContent = state.total.toLocaleString();
    }

    function coordinateText(point) {
        const latitude = `${Math.abs(point.lat).toFixed(2)}° ${point.lat >= 0 ? "N" : "S"}`;
        const longitude = `${Math.abs(point.lng).toFixed(2)}° ${point.lng >= 0 ? "E" : "W"}`;
        return `${latitude}, ${longitude}`;
    }

    function validCoordinate(point) {
        return point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
        && point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180;
    }

    function clearSceneMessage() {
        const message = $("#street-view .scene-loading");
        if (message) message.remove();
    }

    function choseRegion() {
        return regions[Math.floor(Math.random() * regions.length)];
    }

    function makeBounds(region) {
        const centerLng = region[0] + Math.random() * (region[2] - region[0]);
        const centerLat = region[1] + Math.random() * (region[3] - region[1]);
        const halfsize = 0.01;
        return `${centerLng - halfsize},${centerLat - halfSize},${centerLng + halfSize},${centerLat + halfsize}`;
    }

    async function fetchScene() {
        if (!TOKEN || TOKEN.includes("PASTE_")) {
            throw new Error("Mapillary Access Token Not Found.");
        }
        let lastError = "No street imagery was found nearby.";
        for (let attempt = 0; attempt < 8; attempt +=1) {
            const region = chooseRegion();
            const query = new URLSearchParams({ access_token: TOKEN, fields: "id,computed_geometry", bbox: makeBounds(region), limit: "50" });
            const response = await fetch(`https://graph.mapillary.com/images?${query}`);
            if (!response.ok) {
                if (response.status === 401) throw new Error("The Mapillary Token was rejected.");
                lastError = "Mapillary could not return imagery right now.";
                continue;
            }
            const payload = await response.json();
            const usable = (payload.data || []).filter((item) => item.id && item.computed_geometry);
            if (!usable.length) continue;
            const chosen = usable[Math.floor(Math.random() * usable.length)];
            const point = chosen.computed_geometry.coordinates;
            if (!Array.isArray(point) || point.length < 2) continue;
            return { id: chosen.id, lat: Number(point[1]), lng: Number(point[0]) };
        }
        throw new Error(`${lastError} Please try again.`);
    }

    function createMap() {
        state.map = L.map("guess-map", { WorldCopyJump: true, minZoom: 2, maxZoom: 18 }).setView([25, 0], 2);
        L.titleLayer("https://{s}.title.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(state.map);
        state.map.on("click", (event) => placeGuess(event.latlng));
    }

    function markerIcon(kind) {
        return L.divIcon({ className: kind === "actual" ? "actual-pin" : "guess-pin", iconSize: [21, 21], iconAnchor: [7, 20], popupAnchor: [4, -18] });
    }

    function placeGuess(lating) {
        if (resultCard.hidden === false) return;
        state.guess = { lat: latlng.lat, lng: latlng.lng };
        if (state.guessMarker) state.map.removeLayer(state.guessMarker);
        state.guessMarker = L.marker(latlng, { icon: markerIcon("guess") }).addTo(state.map).bindPopup("Your Guess").openPopup();
        $("guess-hint").textContent = `${coordinateText(state.guess)} selected`;
        submitButton.disabled = false;
    }

    function clearMap() {
        [state.guessMarker, state.actualMarker, state.line]. forEach((item) => item && state.map.removeLayer(item));
        state.guessMarker = null;
        state.actualMarker = null;
        state.line = null;
        state.guess = null;
        state.map.setView([25, 0], 2);
        $("#guess-hint").textContent = "Click the map. Trust you gut.";
        submitButton.disabled = true;
    }

    function showScene(scene) {
    if (!scene || !validCoordinate({ lat: scene.lat, lng: scene.lng }) || !scene.id) {
      throw new Error("Mapillary returned an incomplete street scene.");
    }
    state.actual = scene;
    if (state.viewer) {
      state.viewer.remove();
      state.viewer = null;
    }
    try {
      state.viewer = new mapillary.Viewer({ accessToken: TOKEN, container: "street-view", imageId: scene.id });
      state.viewer.on("load", clearSceneMessage);
    } catch (error) {
      throw new Error("The street-view player could not be opened.");
    }
  }

  function haversine(first, second) {
    const radius = 6371;
    const radians = (value) => value * Math.PI / 180;
    const dLat = radians(second.lat - first.lat);
    const dLng = radians(second.lng - first.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function calculateScore(distance) {
    return Math.max(0, Math.round(MAX_SCORE * Math.exp(-distance / 1800)));
  }

  function formatDistance(distance) {
    return distance < 1 ? `${Math.round(distance * 1000)} m` : `${Math.round(distance).toLocaleString()} km`;
  }

  function showResult() {
    const distance = haversine(state.guess, state.actual);
    const score = calculateScore(distance);
    state.total += score;
    state.map.invalidateSize();
    state.actualMarker = L.marker([state.actual.lat, state.actual.lng], { icon: markerIcon("actual") }).addTo(state.map).bindPopup("Actual location");
    state.line = L.polyline([[state.guess.lat, state.guess.lng], [state.actual.lat, state.actual.lng]], { color: "#c45043", weight: 2, dashArray: "5 6" }).addTo(state.map);
    state.map.fitBounds([[state.guess.lat, state.guess.lng], [state.actual.lat, state.actual.lng]], { padding: [45, 45], maxZoom: 10 });
    $("#result-title").textContent = score > 4000 ? "Incredible guess." : score > 2000 ? "Good instincts." : "A new corner of the world.";
    $("#result-summary").textContent = `You were ${formatDistance(distance)} from the scene.`;
    $("#result-guess").textContent = coordinateText(state.guess);
    $("#result-actual").textContent = coordinateText(state.actual);
    $("#result-distance").textContent = formatDistance(distance);
    $("#result-score").textContent = score.toLocaleString();
    nextButton.textContent = state.round === TOTAL_ROUNDS ? "See final score" : "Next round";
    resultCard.hidden = false;
    submitButton.disabled = true;
    updateHeader();
    setStatus("Round complete. The actual location is shown on the map.", "success");
  }

  async function startRound() {
    resultCard.hidden = true;
    clearMap();
    updateHeader();
    setStatus("Looking for somewhere…");
    $("#street-view").innerHTML = "<div class=\"scene-loading\">Loading street imagery…</div>";
    try {
      const scene = await fetchScene();
      showScene(scene);
      setStatus("Alright, take a guess.", "success");
    } catch (error) {
      $("#street-view").innerHTML = `<div class="scene-error"><strong>Could not load a scene</strong><span>${error.message}</span><button class="text-button" id="retry-scene" type="button">Try again</button></div>`;
      $("#retry-scene").addEventListener("click", startRound);
      setStatus(error.message, "error");
    }
  }

  function showFinal() {
    $("#game-screen").hidden = true;
    $("#final-screen").hidden = false;
    $("#final-score").textContent = state.total.toLocaleString();
    const ratio = state.total / (TOTAL_ROUNDS * MAX_SCORE);
    $("#final-message").textContent = ratio > .8 ? "A remarkable trip around the globe." : ratio > .45 ? "A thoughtful tour with some great finds." : "The world is big. Ready for another tour?";
  }

  function resetGame() {
    state.round = 1;
    state.total = 0;
    $("#game-screen").hidden = false;
    $("#final-screen").hidden = true;
    startRound();
  }

  window.addEventListener("resize", () => {
    if (state.map) state.map.invalidateSize({ animate: false });
  });

  window.addEventListener("error", (event) => {
    if (event.target && event.target.tagName === "SCRIPT" && event.target.src.includes("mapillary")) {
      setStatus("The street-view library could not be loaded. Check your connection and refresh.", "error");
    }
  }, true);

  submitButton.addEventListener("click", () => { if (state.guess && state.actual) showResult(); });
  nextButton.addEventListener("click", () => { if (state.round === TOTAL_ROUNDS) showFinal(); else { state.round += 1; startRound(); } });
  $("#play-again").addEventListener("click", resetGame);
  createMap();
  startRound();
})();