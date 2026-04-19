document.addEventListener("DOMContentLoaded", () => {

  const BASE_URL = window.location.origin;

  // Splash screen
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('hide');
  }, 2000);

  // Map setup
  const map = L.map('map').setView([25.408481, 68.260604], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  let markers = [];
  let lastSearchTerm = '';

  // Get selected filters
  function getSelectedCriteria() {
    return Array.from(document.querySelectorAll("input[type='checkbox']:checked"))
      .map(cb => cb.value);
  }

  // Marker icon
  function getMarkerIcon(color) {
    return L.divIcon({
      className: 'custom-pin',
      html: `
        <div class="pin" style="background:${color}">
          <div class="pin-inner"></div>
        </div>
      `,
      iconSize: [30, 42],
      iconAnchor: [15, 42],
      popupAnchor: [0, -40]
    });
  }

  // Load buildings
  async function loadBuildings() {
    try {
      const search = document.getElementById("search")?.value.trim().toLowerCase() || "";
      const selectedCriteria = getSelectedCriteria();

      if (!search && selectedCriteria.length === 0) {
        alert("Please enter a place or select filters.");
        return;
      }

      lastSearchTerm = search;

      markers.forEach(m => map.removeLayer(m));
      markers = [];

      const res = await fetch(`${BASE_URL}/api/places-full`);
      if (!res.ok) throw new Error("Fetch failed");

      let buildings = await res.json();

      if (search) {
        buildings = buildings.filter(b =>
          b.name.toLowerCase().includes(search) ||
          b.category?.toLowerCase().includes(search)
        );
      }

      buildings.forEach(b => {
        if (!b.lat || !b.lng) return;

        let total = 0, count = 0, criteriaMet = 0;
        let criteriaHTML = '';

        if (selectedCriteria.length > 0) {
          selectedCriteria.forEach(s => {
            const score = b.serviceScores?.[s] || 0;
            total += score;
            count++;
            if (score > 0) criteriaMet++;

            criteriaHTML += `<div><span>${s}</span><span>${score}/5</span></div>`;
          });

          if (criteriaMet === 0) return;
        }

        const score = count
          ? total / count
          : Object.values(b.serviceScores || {}).reduce((a, c) => a + c, 0) /
            Object.values(b.serviceScores || {}).length;

        const color =
          score >= 4 ? '#10B981' :
          score >= 2.5 ? '#F59E0B' : '#EF4444';

        const marker = L.marker([b.lat, b.lng], {
          icon: getMarkerIcon(color)
        }).addTo(map).bindPopup(`
          <div class="card">
            <h3>${b.name}</h3>
            <p>⭐ ${score.toFixed(1)}/5</p>
          </div>
        `);

        markers.push(marker);
      });

      if (markers.length) {
        map.fitBounds(markers.map(m => m.getLatLng()));
      }

    } catch (err) {
      console.error(err);
      alert("Error loading data");
    }
  }

  window.loadBuildings = loadBuildings;

  // REVIEW MODAL SAFE
  window.openReviewModal = async function (id, name) {
    const res = await fetch(`${BASE_URL}/api/buildings`);
    const buildings = await res.json();
    const b = buildings.find(x => x.id == id);

    document.getElementById("reviewContent").innerHTML = `
      <div class="card">
        <h3>${name}</h3>
        <button onclick="submitReview(${id})">Submit</button>
      </div>
    `;

    document.getElementById("reviewModal").style.display = "block";
  };

  // SUBMIT REVIEW
  window.submitReview = async function (id) {
    try {
      const fileInput = document.querySelector(`#review-${id}-image`);
      if (fileInput && !fileInput.files.length) {
        alert("Upload image required");
        return;
      }

      const photos = await Promise.all(
        Array.from(fileInput.files).map(file => new Promise(res => {
          const reader = new FileReader();
          reader.onload = e => res(e.target.result);
          reader.readAsDataURL(file);
        }))
      );

      await fetch(`${BASE_URL}/api/buildings/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ratings: {}, photos })
      });

      alert("Review submitted!");
      document.getElementById("reviewModal").style.display = "none";

      loadBuildings();

    } catch (e) {
      console.error(e);
    }
  };

  // IMAGE MODAL SAFE
  window.openModal = function (src) {
    document.getElementById("imgModal").style.display = "block";
    document.getElementById("modalImg").src = src;
  };

  // MENU SAFE
  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.querySelector(".sidebar");

  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  // ENTER SEARCH
  document.getElementById("search")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadBuildings();
  });

});
