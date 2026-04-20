document.addEventListener("DOMContentLoaded", () => {
  const BASE_URL = window.location.origin;

  // Hide splash after 2 seconds
  setTimeout(() =
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('hide');
  }, 2000);

  const map = L.map('map').setView([25.408481, 68.260604], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  let markers = [];
  let lastSearchTerm = '';

  // Get selected criteria
  function getSelectedCriteria() {
    return Array.from(
      document.querySelectorAll("input[type='checkbox']:checked")
    ).map(cb => cb.value);
  }

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

  // Load buildings - FULL ORIGINAL FUNCTIONALITY
  async function loadBuildings() {
    try {
      const search = document.getElementById("search")?.value.trim().toLowerCase() || "";
      const selectedCriteria = getSelectedCriteria();

      // ❗ New validation logic
      if (!search && selectedCriteria.length === 0) {
        alert("Please enter a place OR select at least one accessibility need.");
        return;
      }

      lastSearchTerm = search;

      // Clear old markers
      markers.forEach(m => map.removeLayer(m));
      markers = [];

      // 🔥 URL FIXED
      const res = await fetch(`${BASE_URL}/api/places-full`);
      if (!res.ok) throw new Error("Failed to fetch buildings");

      const allBuildings = await res.json();

      // 🔥 FILTER LOGIC - FULL ORIGINAL
      let buildings = allBuildings;

      // 1️⃣ Filter by search ONLY if search exists
      if (search) {
        buildings = buildings.filter(b => 
          b.name.toLowerCase().includes(search) || 
          b.category?.toLowerCase().includes(search)
        );
      }

      buildings.forEach(b => {
        if (!b.lat || !b.lng) return;

        let total = 0, count = 0, criteriaMet = 0;
        let criteriaBreakdownHTML = '';

        // 2️⃣ If user selected criteria → apply filtering
        if (selectedCriteria.length > 0) {
          selectedCriteria.forEach(service => {
            const score = b.serviceScores?.[service] || 0;
            total += score;
            count++;
            if (score > 0) criteriaMet++;

            criteriaBreakdownHTML += `
              <div><span>${service}</span><span>${score}/5</span></div>
            `;
          });

          // ❌ Skip if NONE of selected criteria match
          if (criteriaMet === 0) return;
        }

        // 3️⃣ If no criteria selected → use overall score
        const personalizedScore = count > 0 
          ? (total / count) 
          : (b.serviceScores 
              ? Object.values(b.serviceScores).reduce((a, c) => a + c, 0) / Object.values(b.serviceScores).length 
              : 0);

        let color = personalizedScore >= 4 ? '#10B981' :
                    personalizedScore >= 2.5 ? '#F59E0B' :
                    '#EF4444';

        const overallScore = b.serviceScores && Object.values(b.serviceScores).length
          ? (Object.values(b.serviceScores).reduce((a, c) => a + c, 0) / Object.values(b.serviceScores).length).toFixed(1)
          : 'N/A';

        const lastUpdated = b.lastVerified 
          ? new Date(b.lastVerified).toLocaleString() 
          : 'N/A';

        // 🔥 URL FIXED in popup
        const marker = L.marker([b.lat, b.lng], {
          icon: getMarkerIcon(color)
        }).addTo(map).bindPopup(generatePersonalizedCard(b, {
          criteriaMet,
          count,
          personalizedScore,
          criteriaBreakdownHTML,
          overallScore,
          lastUpdated
        }));

        markers.push(marker);
      });

      if (markers.length > 0) {
        map.fitBounds(markers.map(m => m.getLatLng()));
      } else {
        alert("No locations found matching your criteria.");
      }

    } catch (err) {
      console.error(err);
      alert("Error loading buildings.");
    }
  }

  // Generate popup card - FULL ORIGINAL
  function generatePersonalizedCard(building, data) {
  const { criteriaMet, count, personalizedScore, criteriaBreakdownHTML, overallScore, lastUpdated } = data;

  let allServicesHTML = '';
  for (let service in building.serviceScores) {
    allServicesHTML += `
      <div><span>${service}</span><span>${building.serviceScores[service]}/5</span></div>
    `;
  }

  // 🔥 FIXED IMAGE HANDLING
  let photosHTML = '';
  if (building.photos?.length) {
    photosHTML = `
      <div class="photo-grid">
        ${building.photos.map(p => {
          // Smart URL handling: full URL → use as-is, relative → prepend BASE_URL
          const imgSrc = p.startsWith('http') ? p : `${BASE_URL}/${p}`;
          return `<img src="${imgSrc}" onclick="openModal('${imgSrc}')" alt="Photo" style="max-width:100%; height:auto;">`;
        }).join('')}
      </div>
    `;
  }

  const scoreClass = personalizedScore >= 4 ? 'excellent' :
    personalizedScore >= 2.5 ? 'good' : 'poor';

  return `
    <div class="card">
      <h3>${building.name}</h3>
      <div class="score-badge score-${scoreClass}">
        ⭐ ${personalizedScore.toFixed(1)}/5 (${criteriaMet}/${count})
      </div>
      <div class="service-breakdown">
        <strong>Your Needs:</strong>
        ${criteriaBreakdownHTML}
      </div>
      <div class="service-breakdown">
        <strong>All Services:</strong>
        ${allServicesHTML}
        <div style="margin-top:4px; font-size:13px; color:#6b7280;">
          🌟 Overall: ${overallScore}/5
          <br>
          Last Updated: ${lastUpdated}
        </div>
      </div>
      ${photosHTML}
      <button class="review-btn" onclick="openReviewModal(${building.id}, '${building.name.replace(/'/g, "\\'")}')">
        Add Review
      </button>
    </div>
  `;
  }

  // Star ratings - FULL ORIGINAL
  function initStarRatings(buildingId) {
    document.querySelectorAll(`[data-service^="review-${buildingId}-"]`).forEach(container => {
      const stars = container.querySelectorAll('.star-btn');
      const hiddenInput = document.getElementById(container.dataset.service);

      stars.forEach((star, index) => {
        star.onclick = () => {
          const rating = parseInt(star.dataset.rating);
          hiddenInput.value = rating;
          stars.forEach((s, i) => s.classList.toggle('active', i < rating));
        };

        star.onmouseover = () => {
          const rating = parseInt(star.dataset.rating);
          stars.forEach((s, i) => s.style.color = i < rating ? '#FBBF24' : '#E2E8F0');
        };

        star.onmouseout = () => {
          const current = parseInt(hiddenInput.value) || 0;
          stars.forEach((s, i) => {
            s.style.color = i < current ? '#FBBF24' : '#E2E8F0';
            s.classList.toggle('active', i < current);
          });
        };
      });
    });
  }

  // Review form - FULL ORIGINAL
  function generateReviewForm(buildingId, buildingName, serviceScores) {
    function formatServiceName(service) {
      return service.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    }

    let ratingsHTML = '';
    for (let service in serviceScores) {
      ratingsHTML += `
        <div class="rating-item">
          <span>${formatServiceName(service)}</span>
          <div class="star-rating" data-service="review-${buildingId}-${service}">
            ${[1, 2, 3, 4, 5].map(rating => `<i class="fas fa-star star-btn" data-rating="${rating}"></i>`).join('')}
            <input type="hidden" id="review-${buildingId}-${service}" value="0">
          </div>
        </div>
      `;
    }

    return `
      <div class="card">
        <div class="review-header">
          <h3>${buildingName}</h3>
          <p>Rate each accessibility feature</p>
        </div>

        <div class="ratings-section">
          <div class="ratings-grid">
            ${ratingsHTML}
          </div>
        </div>

        <div class="photo-section">
          <label>
            Upload Photos
            <input type="file" id="review-${buildingId}-image" accept="image/*" multiple required>
          </label>
        </div>

        <div class="submit-section">
          <button class="review-submit-btn" onclick="submitReview(${buildingId})">Submit Review</button>
        </div>
      </div>
    `;
  }

  // Open review modal - URL FIXED
  window.openReviewModal = async function (buildingId, buildingName) {
    try {
      const res = await fetch(`${BASE_URL}/api/buildings`);
      const buildings = await res.json();
      const building = buildings.find(b => b.id == buildingId);

      const reviewContent = document.getElementById('reviewContent');
      reviewContent.innerHTML = generateReviewForm(buildingId, building.name, building.serviceScores);

      setTimeout(() => initStarRatings(buildingId), 100);

      document.getElementById('reviewModal').style.display = 'block';
    } catch (err) {
      console.error(err);
      alert("Error loading building.");
    }
  };

  // Submit review - URL FIXED + FULL ORIGINAL
  window.submitReview = async function (buildingId) {
    try {
      // Collect ratings
      let ratings = {};
      document.querySelectorAll(`[id^="review-${buildingId}-"]:not([type="file"])`).forEach(inp => {
        const service = inp.id.split('-')[2];
        ratings[service] = parseInt(inp.value) || null;
      });

      const fileInput = document.getElementById(`review-${buildingId}-image`);

      // Validate files
      if (!fileInput.files.length) {
        alert("Please upload at least 1 image (required!)");
        return;
      }

      for (let file of fileInput.files) {
        if (!file.type.startsWith('image/')) {
          alert("Only image files are allowed!");
          return;
        }
        if (file.size > 2 * 1024 * 1024) {
          alert("Each image must be less than 2MB");
          return;
        }
      }

      // Convert to base64
      const base64Images = await Promise.all(
        Array.from(fileInput.files).map(file => new Promise(res => {
          const reader = new FileReader();
          reader.onload = e => res(e.target.result);
          reader.readAsDataURL(file);
        }))
      );

      console.log('📤 Submitting:', { buildingId, ratings, photoCount: base64Images.length });

      // 🔥 URL FIXED
      const response = await fetch(`${BASE_URL}/api/buildings/${buildingId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratings, photos: base64Images })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Review submission failed');
      }

      const result = await response.json();
      console.log('✅ Review saved:', result);

      alert("🎉 Review submitted successfully!\n" + 
            `${result.saved.reviews} reviews + ${result.saved.photos} photos saved`);

      // Close modal
      document.getElementById('reviewModal').style.display = 'none';

      // 🔥 REFRESH MAP WITH NEW DATA
      if (typeof loadBuildings === 'function' && lastSearchTerm) {
        setTimeout(() => {
          loadBuildings();
        }, 800);
      }
    } catch (err) {
      console.error('❌ Submit error:', err);
      alert("Error submitting review: " + err.message);
    }
  };

  // Image modal - URL SAFE
  window.openModal = function (src) {
    document.getElementById("imgModal").style.display = "block";
    document.getElementById("modalImg").src = src;
  };

  // Close modals
  document.addEventListener('click', (e) => {
    if (e.target.id === 'reviewModal') document.getElementById('reviewModal').style.display = 'none';
    if (e.target.id === 'imgModal') document.getElementById('imgModal').style.display = 'none';
    if (e.target.classList.contains('close-review')) document.getElementById('reviewModal').style.display = 'none';
    if (e.target.classList.contains('close')) document.getElementById('imgModal').style.display = 'none';
  });

  // Guide Modal
  const guideBtn = document.getElementById('guideBtn');
  const guideModal = document.getElementById('guideModal');
  const closeGuide = document.querySelector('.close-guide');
  if (guideBtn && guideModal) guideBtn.onclick = () => guideModal.style.display = 'block';
  if (closeGuide) closeGuide.onclick = () => guideModal.style.display = 'none';
  window.addEventListener('click', (e) => { 
    if (e.target === guideModal) guideModal.style.display = 'none'; 
  });

  window.loadBuildings = loadBuildings;
});

// Menu - SAFE VERSION
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.querySelector(".sidebar");
if (menuBtn && sidebar) {
  menuBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

// Optional close on outside click
document.addEventListener("click", (e) => {
  if (menuBtn && sidebar && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
    sidebar.classList.remove("open");
  }
});

function triggerSearch() {
  if (typeof loadBuildings === 'function') loadBuildings();
}

// Enter key support
const searchInput = document.getElementById("search");
if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") triggerSearch();
  });
              }
document.addEventListener("DOMContentLoaded", () => {
  const BASE_URL = window.location.origin;

  // Hide splash after 2 seconds
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('hide');
  }, 2000);

  const map = L.map('map').setView([25.408481, 68.260604], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  let markers = [];
  let lastSearchTerm = '';

  // Get selected criteria
  function getSelectedCriteria() {
    return Array.from(
      document.querySelectorAll("input[type='checkbox']:checked")
    ).map(cb => cb.value);
  }

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
        alert("Please enter a place OR select at least one accessibility need.");
        return;
      }

      lastSearchTerm = search;
      markers.forEach(m => map.removeLayer(m));
      markers = [];

      const res = await fetch(`${BASE_URL}/api/places-full`);
      if (!res.ok) throw new Error("Failed to fetch buildings");

      const allBuildings = await res.json();
      let buildings = allBuildings;

      if (search) {
        buildings = buildings.filter(b => 
          b.name.toLowerCase().includes(search) || 
          b.category?.toLowerCase().includes(search)
        );
      }

      buildings.forEach(b => {
        if (!b.lat || !b.lng) return;

        let total = 0, count = 0, criteriaMet = 0;
        let criteriaBreakdownHTML = '';

        if (selectedCriteria.length > 0) {
          selectedCriteria.forEach(service => {
            const score = b.serviceScores?.[service] || 0;
            total += score;
            count++;
            if (score > 0) criteriaMet++;
            criteriaBreakdownHTML += `<div><span>${service}</span><span>${score}/5</span></div>`;
          });
          if (criteriaMet === 0) return;
        }

        const personalizedScore = count > 0 
          ? (total / count) 
          : (b.serviceScores 
              ? Object.values(b.serviceScores).reduce((a, c) => a + c, 0) / Object.values(b.serviceScores).length 
              : 0);

        let color = personalizedScore >= 4 ? '#10B981' :
                    personalizedScore >= 2.5 ? '#F59E0B' :
                    '#EF4444';

        const overallScore = b.serviceScores && Object.values(b.serviceScores).length
          ? (Object.values(b.serviceScores).reduce((a, c) => a + c, 0) / Object.values(b.serviceScores).length).toFixed(1)
          : 'N/A';

        const lastUpdated = b.lastVerified 
          ? new Date(b.lastVerified).toLocaleString() 
          : 'N/A';

        const marker = L.marker([b.lat, b.lng], {
          icon: getMarkerIcon(color)
        }).addTo(map).bindPopup(generatePersonalizedCard(b, {
          criteriaMet, count, personalizedScore, criteriaBreakdownHTML, overallScore, lastUpdated
        }));

        markers.push(marker);
      });

      if (markers.length > 0) {
        map.fitBounds(markers.map(m => m.getLatLng()));
      } else {
        alert("No locations found matching your criteria.");
      }

    } catch (err) {
      console.error(err);
      alert("Error loading buildings.");
    }
  }

  // 🔥 PERFECTED IMAGE HANDLING FOR PUBLIC FOLDER
  function generatePersonalizedCard(building, data) {
    const { criteriaMet, count, personalizedScore, criteriaBreakdownHTML, overallScore, lastUpdated } = data;

    let allServicesHTML = '';
    for (let service in building.serviceScores) {
      allServicesHTML += `<div><span>${service}</span><span>${building.serviceScores[service]}/5</span></div>`;
    }

    // 🔥 PUBLIC FOLDER + ALL FORMATS SUPPORT
    let photosHTML = '';
    if (building.photos?.length) {
      photosHTML = `
        <div class="photo-grid" style="margin:10px 0;display:flex;gap:5px;flex-wrap:wrap;">
          ${building.photos.map(p => {
            let imgSrc;
            if (p.startsWith('http')) {
              imgSrc = p;
            } else if (p.startsWith('/uploads/') || p.startsWith('uploads/')) {
              imgSrc = `${BASE_URL}${p.startsWith('/') ? '' : '/'}${p}`;
            } else {
              imgSrc = `${BASE_URL}/uploads/${p}`; // public/uploads/ default
            }
            return `
              <img src="${imgSrc}" 
                   onerror="this.style.display='none'" 
                   onclick="openModal('${imgSrc}')" 
                   style="width:70px;height:70px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #eee;"
                   alt="${building.name} photo"
                   loading="lazy">
            `;
          }).join('')}
        </div>
      `;
    }

    const scoreClass = personalizedScore >= 4 ? 'excellent' :
      personalizedScore >= 2.5 ? 'good' : 'poor';

    return `
      <div class="card" style="max-width:300px;font-family:sans-serif;">
        <h3 style="margin:0 0 10px 0;font-size:18px;">${building.name}</h3>
        <div class="score-badge score-${scoreClass}" style="padding:6px 12px;border-radius:20px;font-weight:bold;margin-bottom:12px;">
          ⭐ ${personalizedScore.toFixed(1)}/5 (${criteriaMet}/${count})
        </div>
        <div style="margin-bottom:12px;">
          <strong style="color:#374151;">Your Needs:</strong>
          ${criteriaBreakdownHTML}
        </div>
        <div style="margin-bottom:12px;">
          <strong style="color:#374151;">All Services:</strong>
          ${allServicesHTML}
          <div style="margin-top:4px;font-size:13px;color:#6b7280;">
            🌟 Overall: ${overallScore}/5<br>Last Updated: ${lastUpdated}
          </div>
        </div>
        ${photosHTML}
        <button class="review-btn" onclick="openReviewModal(${building.id}, '${building.name.replace(/'/g, "\\'")}')" 
                style="width:100%;padding:10px;background:#3B82F6;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">
          Add Review
        </button>
      </div>
    `;
  }

  // Star ratings
  function initStarRatings(buildingId) {
    document.querySelectorAll(`[data-service^="review-${buildingId}-"]`).forEach(container => {
      const stars = container.querySelectorAll('.star-btn');
      const hiddenInput = document.getElementById(container.dataset.service);

      stars.forEach((star, index) => {
        star.onclick = () => {
          const rating = parseInt(star.dataset.rating);
          hiddenInput.value = rating;
          stars.forEach((s, i) => s.classList.toggle('active', i < rating));
        };

        star.onmouseover = () => {
          const rating = parseInt(star.dataset.rating);
          stars.forEach((s, i) => s.style.color = i < rating ? '#FBBF24' : '#E2E8F0');
        };

        star.onmouseout = () => {
          const current = parseInt(hiddenInput.value) || 0;
          stars.forEach((s, i) => {
            s.style.color = i < current ? '#FBBF24' : '#E2E8F0';
            s.classList.toggle('active', i < current);
          });
        };
      });
    });
  }

  // Review form
  function generateReviewForm(buildingId, buildingName, serviceScores) {
    function formatServiceName(service) {
      return service.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    }

    let ratingsHTML = '';
    for (let service in serviceScores) {
      ratingsHTML += `
        <div class="rating-item" style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <span style="min-width:140px;font-weight:500;">${formatServiceName(service)}</span>
          <div class="star-rating" data-service="review-${buildingId}-${service}" style="display:flex;gap:2px;">
            ${[1,2,3,4,5].map(rating => `<i class="fas fa-star star-btn" data-rating="${rating}" style="font-size:20px;color:#E2E8F0;cursor:pointer;"></i>`).join('')}
            <input type="hidden" id="review-${buildingId}-${service}" value="0">
          </div>
        </div>
      `;
    }

    return `
      <div class="card" style="max-width:400px;">
        <div class="review-header" style="text-align:center;padding-bottom:20px;">
          <h3 style="margin:0;font-size:20px;">${buildingName}</h3>
          <p style="color:#6b7280;margin:4px 0 0 0;">Rate each accessibility feature</p>
        </div>
        <div class="ratings-section">
          <div class="ratings-grid" style="max-height:300px;overflow-y:auto;">
            ${ratingsHTML}
          </div>
        </div>
        <div class="photo-section" style="margin:20px 0;">
          <label style="display:block;padding:12px;border:2px dashed #3B82F6;border-radius:8px;text-align:center;cursor:pointer;">
            📸 Upload Photos (Required)
            <input type="file" id="review-${buildingId}-image" accept="image/*" multiple style="display:none;">
          </label>
        </div>
        <div class="submit-section" style="text-align:center;">
          <button class="review-submit-btn" onclick="submitReview(${buildingId})" 
                  style="width:100%;padding:14px;background:#10B981;color:white;border:none;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;">
            Submit Review
          </button>
        </div>
      </div>
    `;
  }

  window.openReviewModal = async function (buildingId, buildingName) {
    try {
      const res = await fetch(`${BASE_URL}/api/buildings`);
      const buildings = await res.json();
      const building = buildings.find(b => b.id == buildingId);

      document.getElementById('reviewContent').innerHTML = generateReviewForm(buildingId, building.name, building.serviceScores);
      setTimeout(() => initStarRatings(buildingId), 100);
      document.getElementById('reviewModal').style.display = 'block';
    } catch (err) {
      console.error(err);
      alert("Error loading building.");
    }
  };

  window.submitReview = async function (buildingId) {
    try {
      let ratings = {};
      document.querySelectorAll(`[id^="review-${buildingId}-"]:not([type="file"])`).forEach(inp => {
        const service = inp.id.split('-')[2];
        ratings[service] = parseInt(inp.value) || null;
      });

      const fileInput = document.getElementById(`review-${buildingId}-image`);
      if (!fileInput.files.length) {
        alert("Please upload at least 1 image (required!)");
        return;
      }

      for (let file of fileInput.files) {
        if (!file.type.startsWith('image/')) {
          alert("Only image files are allowed!");
          return;
        }
        if (file.size > 2 * 1024 * 1024) {
          alert("Each image must be less than 2MB");
          return;
        }
      }

      const base64Images = await Promise.all(
        Array.from(fileInput.files).map(file => new Promise(res => {
          const reader = new FileReader();
          reader.onload = e => res(e.target.result);
          reader.readAsDataURL(file);
        }))
      );

      const response = await fetch(`${BASE_URL}/api/buildings/${buildingId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratings, photos: base64Images })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Review submission failed');
      }

      const result = await response.json();
      alert("🎉 Review submitted successfully!\n" + `${result.saved.reviews} reviews + ${result.saved.photos} photos saved`);
      document.getElementById('reviewModal').style.display = 'none';

      if (lastSearchTerm) setTimeout(loadBuildings, 800);
    } catch (err) {
      console.error('❌ Submit error:', err);
      alert("Error submitting review: " + err.message);
    }
  };

  window.openModal = function (src) {
    document.getElementById("imgModal").style.display = "block";
    document.getElementById("modalImg").src = src;
  };

  // Close modals
  document.addEventListener('click', (e) => {
    if (e.target.id === 'reviewModal') document.getElementById('reviewModal').style.display = 'none';
    if (e.target.id === 'imgModal') document.getElementById('imgModal').style.display = 'none';
    if (e.target.classList.contains('close-review')) document.getElementById('reviewModal').style.display = 'none';
    if (e.target.classList.contains('close')) document.getElementById('imgModal').style.display = 'none';
  });

  // Guide Modal
  const guideBtn = document.getElementById('guideBtn');
  const guideModal = document.getElementById('guideModal');
  const closeGuide = document.querySelector('.close-guide');
  if (guideBtn && guideModal) guideBtn.onclick = () => guideModal.style.display = 'block';
  if (closeGuide) closeGuide.onclick = () => guideModal.style.display = 'none';
  window.addEventListener('click', (e) => { 
    if (e.target === guideModal) guideModal.style.display = 'none'; 
  });

  window.loadBuildings = loadBuildings;
});

// Menu
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.querySelector(".sidebar");
if (menuBtn && sidebar) {
  menuBtn.addEventListener("click", () => sidebar.classList.toggle("open"));
  document.addEventListener("click", (e) => {
    if (!sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
      sidebar.classList.remove("open");
    }
  });
}

// Search
const searchInput = document.getElementById("search");
if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadBuildings();
  });
                          }
