// Global State
let currentUser = null;
let requests = [];
let resources = [];
let volunteers = [];
let registeredUsers = [];
let map = null;
let baseMarker = null;
let emergencyMarker = null;
let selectedLocation = null;
let currentRoute = null;
let nextRequestId = 1005;
let routeTimeout = null;
let routeModalTimeout = null;

const BASE_LOCATION = {
    name: "VVCE-MYS",
    lat: 12.3366,
    lng: 76.6187
};

const CREDENTIALS = {
    admin: { username: "1", password: "1", role: "Admin" },
    user: { username: "2", password: "2", role: "User" }
};

// --- Firebase Configuration ---
// TO USER: Replace the following placeholder config with your actual Firebase project config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const WEATHER_API_KEY = "ffc79bc9d96b20005a62a24e1f39113a";
let sbClient = null;

// --- Supabase Configuration ---
async function initSupabase() {
    try {
        const response = await fetch('/config');
        const config = await response.json();
        
        if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
            sbClient = supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
            console.log("✅ Supabase Initialized");
            setupSupabaseRealtime();
        } else {
            console.error("❌ Supabase config missing");
        }
    } catch (error) {
        console.error("❌ Error loading Supabase config:", error);
    }
}

function setupSupabaseRealtime() {
    if (!sbClient) return;

    // Subscribe to real-time changes in sensor_logs table
    const channel = sbClient
        .channel('sensor_logs_changes')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'sensor_logs' },
            (payload) => {
                console.log('New sensor data:', payload.new);
                updateHardwareUI(payload.new);
            }
        )
        .subscribe();

    // Fetch initial data
    fetchLatestSensorData();
}

async function fetchLatestSensorData() {
    if (!sbClient) return;
    const { data, error } = await sbClient
        .from('sensor_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (data && data.length > 0) {
        updateHardwareUI(data[0]);
    }
}

function updateHardwareUI(data) {
    const tempEl = document.getElementById('hwTemp');
    const humEl = document.getElementById('hwHum');
    const soilEl = document.getElementById('hwSoil');
    const waterEl = document.getElementById('hwWater');
    const seismicEl = document.getElementById('hwSeismic');
    const airEl = document.getElementById('hwAir');
    const rainEl = document.getElementById('hwRain');
    const pressureEl = document.getElementById('hwPressure');
    const altitudeEl = document.getElementById('hwAltitude');
    const windSpeedEl = document.getElementById('hwWindSpeed');
    const windDirEl = document.getElementById('hwWindDir');
    const gpsEl = document.getElementById('hwGPS');
    const alertEl = document.getElementById('hwAlert');
    const updateEl = document.getElementById('hwLastUpdate');

    const updateValue = (el, val, suffix = '', cardId) => {
        if (!el) return;
        const newVal = `${val}${suffix}`;
        if (el.textContent !== newVal) {
            el.textContent = newVal;
            const card = document.getElementById(cardId);
            if (card) {
                card.classList.remove('data-flash');
                void card.offsetWidth; // Trigger reflow
                card.classList.add('data-flash');
            }
        }
    };

    updateValue(tempEl, data.temperature ? data.temperature.toFixed(1) : '0.0', '°C', 'hwCardTemp');
    updateValue(humEl, data.humidity ? data.humidity.toFixed(1) : '0.0', '%', 'hwCardHum');
    updateValue(soilEl, data.soil_moisture !== undefined ? data.soil_moisture : '0', '', 'hwCardSoil');
    updateValue(waterEl, data.water_level ? data.water_level.toFixed(1) : '0.0', '', 'hwCardWater');
    updateValue(seismicEl, data.seismic ? data.seismic.toFixed(2) : '0.00', ' m/s²', 'hwCardSeismic');
    updateValue(airEl, data.air_quality ? data.air_quality.toFixed(0) : '0', '', 'hwCardAir');
    updateValue(rainEl, data.rain_level ? data.rain_level.toFixed(0) : '0', '', 'hwCardRain');
    updateValue(pressureEl, data.baro_pressure ? data.baro_pressure.toFixed(1) : '1013.2', ' hPa', 'hwCardPressure');
    updateValue(altitudeEl, data.altitude ? data.altitude.toFixed(1) : '0.0', ' m', 'hwCardAltitude');
    updateValue(windSpeedEl, data.wind_speed ? data.wind_speed.toFixed(1) : '0.0', ' km/h', 'hwCardWindSpeed');
    updateValue(windDirEl, data.wind_direction ? data.wind_direction.toFixed(0) : '0', '°', 'hwCardWindDir');
    
    const latVal = data.latitude ? data.latitude : 0;
    const lngVal = data.longitude ? data.longitude : 0;
    const gpsVal = (latVal !== 0 && lngVal !== 0) ? `${latVal.toFixed(5)}, ${lngVal.toFixed(5)}` : 'No Signal / Fixed';
    updateValue(gpsEl, gpsVal, '', 'hwCardGPS');
    
    const camOverlay = document.getElementById('camOverlay');
    
    if (updateEl) {
        const date = data.created_at ? new Date(data.created_at) : new Date();
        updateEl.textContent = date.toLocaleTimeString();
    }

    // Sync with Leaflet Map Base Station location if dynamic GPS coordinates are available
    if (latVal !== 0 && lngVal !== 0) {
        if (typeof BASE_LOCATION !== 'undefined') {
            BASE_LOCATION.lat = latVal;
            BASE_LOCATION.lng = lngVal;
        }
        if (typeof baseMarker !== 'undefined' && baseMarker) {
            baseMarker.setLatLng([latVal, lngVal]);
            baseMarker.bindPopup(`<b>📡 Dynamic ResQ Link Station</b><br>Lat: ${latVal.toFixed(6)}<br>Lng: ${lngVal.toFixed(6)}<br>Status: Online (GPS Match)`);
        }
    }

    // Sync with User Dashboard elements if they exist
    const userTemp = document.getElementById('userHwTemp');
    const userHum = document.getElementById('userHwHum');
    const userSeismic = document.getElementById('userHwSeismic');
    const userWater = document.getElementById('userHwWater');
    const userSoil = document.getElementById('userHwSoil');
    const userAir = document.getElementById('userHwAir');
    const userRain = document.getElementById('userHwRain');
    const userPressure = document.getElementById('userHwPressure');
    const userAltitude = document.getElementById('userHwAltitude');
    const userWindSpeed = document.getElementById('userHwWindSpeed');
    const userWindDir = document.getElementById('userHwWindDir');
    const userGPS = document.getElementById('userHwGPS');

    if (userTemp) userTemp.textContent = (data.temperature ? data.temperature.toFixed(1) : '0.0') + '°C';
    if (userHum) userHum.textContent = (data.humidity ? data.humidity.toFixed(1) : '0.0') + '%';
    if (userSeismic) userSeismic.textContent = (data.seismic ? data.seismic.toFixed(2) : '0.00') + ' m/s²';
    if (userWater) userWater.textContent = (data.water_level ? data.water_level.toFixed(1) : '0.0');
    if (userSoil) userSoil.textContent = data.soil_moisture !== undefined ? data.soil_moisture : '0';
    if (userAir) userAir.textContent = data.air_quality ? data.air_quality.toFixed(0) : '0';
    if (userRain) userRain.textContent = data.rain_level ? data.rain_level.toFixed(0) : '0';
    if (userPressure) userPressure.textContent = (data.baro_pressure ? data.baro_pressure.toFixed(1) : '1013.2') + ' hPa';
    if (userAltitude) userAltitude.textContent = (data.altitude ? data.altitude.toFixed(1) : '0.0') + ' m';
    if (userWindSpeed) userWindSpeed.textContent = (data.wind_speed ? data.wind_speed.toFixed(1) : '0.0') + ' km/h';
    if (userWindDir) userWindDir.textContent = (data.wind_direction ? data.wind_direction.toFixed(0) : '0') + '°';
    if (userGPS) userGPS.textContent = gpsVal;

    if (alertEl) {
        if (data.status && data.status !== "Updated") {
            alertEl.style.display = 'block';
            alertEl.textContent = `🚨 ALERT: ${data.status}`;
            const isCritical = data.status.includes('Flood') || 
                               data.status.includes('Drought') || 
                               data.status.includes('Earthquake') || 
                               data.status.includes('Smoke') || 
                               data.status.includes('Storm') || 
                               data.status.includes('Heavy Rain');
            alertEl.style.background = isCritical ? '#fee2e2' : '#fef3c7';
            alertEl.style.color = isCritical ? '#991b1b' : '#92400e';
            alertEl.style.border = `1px solid ${isCritical ? '#f87171' : '#fbbf24'}`;
            
            if (isCritical) {
                if (camOverlay) camOverlay.style.display = 'block';
                takeSnapshot(); // Automatic capture on alert
            }
        } else {
            alertEl.style.display = 'none';
            if (camOverlay) camOverlay.style.display = 'none';
        }
    }
}

function toggleHardware() {
    const content = document.getElementById('hardwareContent');
    const icon = document.getElementById('hardwareToggleIcon');
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.style.transform = 'rotate(0deg)';
    } else {
        content.classList.add('expanded');
        icon.style.transform = 'rotate(180deg)';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    fetchWeather(BASE_LOCATION.lat, BASE_LOCATION.lng);
    checkSavedSession();
    initLogin();
});

// Check for saved session in localStorage
function checkSavedSession() {
    const savedUser = localStorage.getItem('drmsCurrentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            document.getElementById('authScreen').style.display = 'none';
            // Dashboard display is handled in initDashboard
            const userRole = document.getElementById('userRole');
            if (userRole) userRole.textContent = currentUser.role;
            initDashboard();
        } catch (e) {
            localStorage.removeItem('drmsCurrentUser');
        }
    }
}

function fillDemoCredentials() {
    document.getElementById('username').value = '1';
    document.getElementById('password').value = '1';
    // Small delay to visual feedback then submit
    setTimeout(() => {
        document.getElementById('loginForm').dispatchEvent(new Event('submit'));
    }, 300);
}

function initLogin() {
    document.getElementById('loginForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        // Reset error
        document.getElementById('loginError').style.display = 'none';

        let user = null;

        // Try local hardcoded credentials first (for testing/maintenance)
        if (username === CREDENTIALS.admin.username && password === CREDENTIALS.admin.password) {
            user = CREDENTIALS.admin;
        } else if (username === CREDENTIALS.user.username && password === CREDENTIALS.user.password) {
            user = CREDENTIALS.user;
        } else {
            // Try Firebase Authentication
            try {
                const userCredential = await auth.signInWithEmailAndPassword(username + "@resqlink.com", password);
                const fbUser = userCredential.user;

                // Fetch additional user data (role) from Firestore
                const userDoc = await db.collection('users').doc(fbUser.uid).get();
                if (userDoc.exists) {
                    user = {
                        username: username,
                        role: userDoc.data().role,
                        uid: fbUser.uid
                    };
                } else {
                    // Fallback for existing auth users without firestore data
                    user = { username: username, role: "User", uid: fbUser.uid };
                }
            } catch (error) {
                console.error("Login error:", error);
                document.getElementById('loginError').textContent = error.message;
                document.getElementById('loginError').style.display = 'block';
                return;
            }
        }

        if (user) {
            currentUser = user;
            // Save session to localStorage
            localStorage.setItem('drmsCurrentUser', JSON.stringify(user));
            document.getElementById('authScreen').style.display = 'none';
            // Dashboard display is handled in initDashboard
            const userRole = document.getElementById('userRole');
            if (userRole) userRole.textContent = user.role;
            initDashboard();
        } else {
            // This handles the case where hardcoded checks failed and Firebase wasn't attempted or failed quietly
            document.getElementById('loginError').textContent = 'Invalid username or password';
            document.getElementById('loginError').style.display = 'block';
        }
    });

    // Initialize registration
    initRegister();
}

// Sliding auth functions with panel swapping
function showRegister() {
    const container = document.getElementById('authContainer');
    const loginCard = document.getElementById('loginFormCard');
    const registerCard = document.getElementById('registerFormCard');

    // Swap panels
    container.classList.add('show-register');

    // Hide login, show register
    loginCard.style.display = 'none';
    registerCard.style.display = 'block';

    document.getElementById('loginError').style.display = 'none';
}

function showLogin() {
    const container = document.getElementById('authContainer');
    const loginCard = document.getElementById('loginFormCard');
    const registerCard = document.getElementById('registerFormCard');

    // Reset panels
    container.classList.remove('show-register');

    // Show login, hide register
    loginCard.style.display = 'block';
    registerCard.style.display = 'none';

    document.getElementById('registerError').style.display = 'none';
    document.getElementById('registerError').textContent = '';
}

// Role selection toggle
function selectRole(role) {
    const userBtn = document.getElementById('roleUserBtn');
    const adminBtn = document.getElementById('roleAdminBtn');

    if (role === 'User') {
        userBtn.classList.add('active');
        adminBtn.classList.remove('active');
    } else {
        adminBtn.classList.add('active');
        userBtn.classList.remove('active');
    }
}

function initRegister() {
    document.getElementById('registerForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;
        const role = document.querySelector('input[name="regRole"]:checked').value;

        const errorDiv = document.getElementById('registerError');

        // Validation
        if (password.length < 6) {
            errorDiv.textContent = 'Password must be at least 6 characters';
            errorDiv.style.display = 'block';
            return;
        }

        if (password !== confirmPassword) {
            errorDiv.textContent = 'Passwords do not match';
            errorDiv.style.display = 'block';
            return;
        }

        // Firebase Registration
        try {
            // Create user in Firebase Auth
            const userCredential = await auth.createUserWithEmailAndPassword(username + "@resqlink.com", password);
            const user = userCredential.user;

            // Store role and metadata in Firestore
            await db.collection('users').doc(user.uid).set({
                username: username,
                role: role,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert(`Account created successfully! You can now login with your credentials.`);

            // Reset form and show login
            document.getElementById('registerForm').reset();
            showLogin();

        } catch (error) {
            console.error("Registration error:", error);
            errorDiv.textContent = error.message;
            errorDiv.style.display = 'block';
        }
    });
}

async function logout() {
    try {
        await auth.signOut();
    } catch (e) {
        console.error("Firebase SignOut error:", e);
    }
    currentUser = null;
    // Clear saved session from localStorage
    localStorage.removeItem('drmsCurrentUser');
    document.getElementById('authScreen').style.display = 'flex';
    const adminDashboard = document.getElementById('adminDashboard');
    const userDashboard = document.getElementById('userDashboard');
    if (adminDashboard) adminDashboard.style.display = 'none';
    if (userDashboard) userDashboard.style.display = 'none';
    // Reset to login panel
    showLogin();
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('loginError').style.display = 'none';
}

function initDashboard() {
    loadDummyData();

    const adminDashboard = document.getElementById('adminDashboard');
    const userDashboard = document.getElementById('userDashboard');

    if (currentUser.role === 'Admin') {
        if (adminDashboard) adminDashboard.style.display = 'block';
        if (userDashboard) userDashboard.style.display = 'none';

        initMap('map', true); // Admin Map: Enable scroll zoom (website view)
        // initForm(); // Removed as Admin no longer has form
        renderRequests();
        renderResources();
        updateStats();

        const weatherSection = document.getElementById('weatherSection');
        const aiDemandSection = document.getElementById('aiDemandSection');
        const hardwareSection = document.getElementById('hardwareSection');
        const statsGrid = document.getElementById('statsGrid');
        const activeRequestsSection = document.getElementById('activeRequestsSection');
        const resolvedRequestsSection = document.getElementById('resolvedRequestsSection');

        if (weatherSection) weatherSection.style.display = 'block';
        if (aiDemandSection) aiDemandSection.style.display = 'block';
        if (hardwareSection) hardwareSection.style.display = 'block';
        if (statsGrid) statsGrid.style.display = 'grid';
        if (activeRequestsSection) activeRequestsSection.style.display = 'block';
        if (resolvedRequestsSection) resolvedRequestsSection.style.display = 'block';

        initSupabase();

        const liveSheetSection = document.getElementById('liveSheetSection');
        if (liveSheetSection) liveSheetSection.style.display = 'block';

        initSheetRefresh();

        document.getElementById('analyticsSection').style.display = 'block';
        document.getElementById('addResourceBtn').style.display = 'block';
        document.getElementById('addResourceBtn').addEventListener('click', openAddResourceModal);
        updateAnalytics();

        // Refresh active requests every 5 seconds
        setInterval(() => {
            renderRequests();
            updateStats();
        }, 5000);
    } else {
        if (adminDashboard) adminDashboard.style.display = 'none';
        if (userDashboard) userDashboard.style.display = 'block';

        initMap('userMap', false); // User/Mobile Map: Disable scroll zoom
        initUserForm();
        renderResources('userResourcesGrid');

        const userRoleSpan = document.getElementById('userDashboardRole');
        if (userRoleSpan) userRoleSpan.textContent = currentUser.fullName || 'User';
    }
}

function loadDummyData() {
    // Calculate smart priorities for dummy data
    const getRandomOffset = () => (Math.random() * 0.04) - 0.02;

    const dummyRequests = [
        {
            id: 1,
            requestId: "REQ-1000",
            resourceType: "Medical Supplies",
            quantityRequested: 150,
            quantityAllocated: 100,
            quantityPending: 50,
            lat: BASE_LOCATION.lat + getRandomOffset(),
            lng: BASE_LOCATION.lng + getRandomOffset(),
            severity: 5,
            individualsAffected: 200,
            status: "partial",
            contactPerson: "Dr. Ramesh Sharma",
            contactPhone: "9876543210",
            description: "Critical medical supplies needed urgently for cyclone victims. Require emergency medicines, first aid kits, and antiseptics. Multiple injuries reported."
        },
        {
            id: 2,
            requestId: "REQ-1001",
            resourceType: "Food & Water",
            quantityRequested: 500,
            quantityAllocated: 0,
            quantityPending: 500,
            lat: BASE_LOCATION.lat + getRandomOffset(),
            lng: BASE_LOCATION.lng + getRandomOffset(),
            severity: 4,
            individualsAffected: 100,
            status: "pending",
            contactPerson: "Rajesh Kumar",
            contactPhone: "9876543211",
            description: "Emergency food supplies and clean drinking water needed for evacuees at temporary shelter. Families include elderly and children requiring immediate assistance."
        },
        {
            id: 3,
            requestId: "REQ-1002",
            resourceType: "Shelter",
            quantityRequested: 30,
            quantityAllocated: 30,
            quantityPending: 0,
            lat: BASE_LOCATION.lat + getRandomOffset(),
            lng: BASE_LOCATION.lng + getRandomOffset(),
            severity: 3,
            individualsAffected: 50,
            status: "allocated",
            contactPerson: "Priya Nair",
            contactPhone: "9876543212",
            description: "Temporary shelter tents required for displaced families whose homes were damaged in heavy rains. Need waterproof tents with basic amenities."
        },
        {
            id: 4,
            requestId: "REQ-1003",
            resourceType: "Ambulance",
            quantityRequested: 5,
            quantityAllocated: 5,
            quantityPending: 0,
            lat: BASE_LOCATION.lat + getRandomOffset(),
            lng: BASE_LOCATION.lng + getRandomOffset(),
            severity: 5,
            individualsAffected: 25,
            status: "resolved",
            contactPerson: "Mohammed Ali",
            contactPhone: "9876543213",
            description: "Emergency medical transport needed for critical patients. Several casualties with severe injuries requiring immediate hospital admission and specialized care.",
            resolvedAt: "2025-11-22T10:30:00Z"
        },
        {
            id: 5,
            requestId: "REQ-1004",
            resourceType: "Rescue Team",
            quantityRequested: 10,
            quantityAllocated: 0,
            quantityPending: 10,
            lat: BASE_LOCATION.lat + getRandomOffset(),
            lng: BASE_LOCATION.lng + getRandomOffset(),
            severity: 4,
            individualsAffected: 80,
            status: "pending",
            contactPerson: "Anil Verma",
            contactPhone: "9876543214",
            description: "Rescue operation urgently needed for people stranded in flooded area. Water level rising rapidly. Require boats and trained rescue personnel immediately."
        }
    ];

    // Add addresses to dummy data
    const addresses = [
        "Near VVCE Campus, Gokulam",
        "KD Road Junction, Mysore",
        "Temple Road, Gokulam 3rd Stage",
        "Near Kalidasa Road",
        "Industrial Area, Hebbal"
    ];

    requests = dummyRequests.map((req, index) => {
        const mlResult = calculateMLPriority(req.resourceType, req.individualsAffected, req.severity);
        return {
            ...req,
            address: addresses[index],
            priorityScore: mlResult.priorityScore,
            mlPriorityClass: mlResult.priorityClass,
            mlConfidence: mlResult.mlConfidence / 100
        };
    });

    resources = [
        { id: 1, name: "Emergency Medical Kit", type: "Medical Supplies", totalQuantity: 500, availableQuantity: 350 },
        { id: 2, name: "Food Packages", type: "Food & Water", totalQuantity: 1000, availableQuantity: 800 },
        { id: 3, name: "Emergency Tents", type: "Shelter", totalQuantity: 100, availableQuantity: 75 },
        { id: 4, name: "Rescue Personnel", type: "Rescue Team", totalQuantity: 50, availableQuantity: 40 },
        { id: 5, name: "Emergency Ambulances", type: "Ambulance", totalQuantity: 20, availableQuantity: 15 }
    ];

    volunteers = [
        { id: 1, name: "Dr. Sandeep", role: "Medical", status: "available", lat: BASE_LOCATION.lat + 0.01, lng: BASE_LOCATION.lng + 0.01, phone: "9123456780" },
        { id: 2, name: "Kiran Kumar", role: "Rescue", status: "busy", lat: BASE_LOCATION.lat - 0.01, lng: BASE_LOCATION.lng + 0.02, phone: "9123456781" },
        { id: 3, name: "Arjun Singh", role: "Driver", status: "available", lat: BASE_LOCATION.lat + 0.02, lng: BASE_LOCATION.lng - 0.01, phone: "9123456782" }
    ];
}

function initMap(mapId = 'map', enableScrollZoom = true) {
    if (map) {
        map.remove();
        map = null;
    }
    map = L.map(mapId, {
        scrollWheelZoom: enableScrollZoom,
        zoomControl: true,
        doubleClickZoom: true,
        touchZoom: true,
        boxZoom: true,
        dragging: true
    }).setView([BASE_LOCATION.lat, BASE_LOCATION.lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    baseMarker = L.marker([BASE_LOCATION.lat, BASE_LOCATION.lng])
        .addTo(map)
        .bindPopup('<b>' + BASE_LOCATION.name + '</b><br>Base Location');

    map.on('click', function (e) {
        selectedLocation = { lat: e.latlng.lat, lng: e.latlng.lng };

        if (emergencyMarker) {
            map.removeLayer(emergencyMarker);
        }

        emergencyMarker = L.marker([e.latlng.lat, e.latlng.lng])
            .addTo(map)
            .bindPopup('<b>Emergency Location</b><br>Lat: ' + e.latlng.lat.toFixed(6) + '<br>Lng: ' + e.latlng.lng.toFixed(6));
    });
}

function showAdminDashboard() {
    document.getElementById('adminDashboard').style.display = 'block';
    document.getElementById('userDashboard').style.display = 'none';
    
    // Ensure all admin sections are properly updated
    renderRequests();
    renderResources();
    renderVolunteers();
    updateStats();
    updateAnalytics();
    updateVolunteerMarkers();
    initSheetRefresh();
}

function showUserDashboard() {
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('userDashboard').style.display = 'block';
    
    // For User, we only show specific sections
    renderResources();
    updateVolunteerMarkers();
    
    // Re-init user map if needed
    setTimeout(() => {
        if (userMap) userMap.invalidateSize();
    }, 100);
}

function initForm() {
    const form = document.getElementById('emergencyForm');
    const resourceTypeSelect = document.getElementById('resourceType');
    const severityInput = document.getElementById('severity');
    const individualsInput = document.getElementById('individualsAffected');

    [resourceTypeSelect, severityInput, individualsInput].forEach(input => {
        input.addEventListener('input', updatePriorityDisplay);
        input.addEventListener('change', updatePriorityDisplay);
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        if (!selectedLocation) {
            alert('Please select a location on the map by clicking on it.');
            return;
        }

        const resourceType = document.getElementById('resourceType').value;
        const quantity = parseInt(document.getElementById('quantity').value);
        const severity = parseInt(document.getElementById('severity').value);
        const individualsAffected = parseInt(document.getElementById('individualsAffected').value);
        const contactPerson = document.getElementById('contactPerson').value.trim();
        const contactPhone = document.getElementById('contactPhone').value.trim();
        const description = document.getElementById('description').value.trim();

        const mlResult = calculateMLPriority(resourceType, individualsAffected, severity);
        const priorityScore = mlResult.priorityScore;
        const mlPriorityClass = mlResult.priorityClass;
        const mlConfidence = mlResult.mlConfidence / 100;

        const newRequest = {
            id: requests.length + 1,
            requestId: `REQ-${nextRequestId++}`,
            resourceType,
            quantityRequested: quantity,
            quantityAllocated: 0,
            quantityPending: quantity,
            lat: selectedLocation.lat,
            lng: selectedLocation.lng,
            severity,
            individualsAffected,
            status: 'pending',
            priorityScore: parseFloat(priorityScore.toFixed(1)),
            mlPriorityClass,
            mlConfidence: parseFloat(mlConfidence.toFixed(2)),
            contactPerson,
            contactPhone,
            description
        };

        requests.push(newRequest);

        form.reset();
        if (emergencyMarker) {
            map.removeLayer(emergencyMarker);
            emergencyMarker = null;
        }
        selectedLocation = null;
        updatePriorityDisplay();

        renderRequests();
        updateStats();
        if (currentUser.role === 'Admin') {
            updateAnalytics();
        }

        alert('Emergency request submitted successfully!');
    });
}

function initUserForm() {
    const form = document.getElementById('userEmergencyForm');
    const resourceTypeSelect = document.getElementById('userResourceType');
    const severityInput = document.getElementById('userSeverity');
    const individualsInput = document.getElementById('userIndividualsAffected');

    if (!form) return;

    [resourceTypeSelect, severityInput, individualsInput].forEach(input => {
        input.addEventListener('input', updateUserPriorityDisplay);
        input.addEventListener('change', updateUserPriorityDisplay);
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        if (!selectedLocation) {
            alert('Please select a location on the map by clicking on it.');
            return;
        }

        const resourceType = document.getElementById('userResourceType').value;
        const quantity = parseInt(document.getElementById('userQuantity').value);
        const severity = parseInt(document.getElementById('userSeverity').value);
        const individualsAffected = parseInt(document.getElementById('userIndividualsAffected').value);
        const description = document.getElementById('userDescription').value.trim();

        const contactPerson = currentUser ? currentUser.fullName : "User";
        const contactPhone = "N/A";

        const mlResult = calculateMLPriority(resourceType, individualsAffected, severity);
        const priorityScore = mlResult.priorityScore;
        const mlPriorityClass = mlResult.priorityClass;
        const mlConfidence = mlResult.mlConfidence / 100;

        const newRequest = {
            id: requests.length + 1,
            requestId: `REQ-${nextRequestId++}`,
            resourceType,
            quantityRequested: quantity,
            quantityAllocated: 0,
            quantityPending: quantity,
            lat: selectedLocation.lat,
            lng: selectedLocation.lng,
            severity,
            individualsAffected,
            status: 'pending',
            priorityScore: parseFloat(priorityScore.toFixed(1)),
            mlPriorityClass,
            mlConfidence: parseFloat(mlConfidence.toFixed(2)),
            contactPerson,
            contactPhone,
            description
        };

        requests.push(newRequest);

        form.reset();
        if (emergencyMarker) {
            map.removeLayer(emergencyMarker);
            emergencyMarker = null;
        }
        selectedLocation = null;
        updateUserPriorityDisplay();

        alert('Emergency request submitted successfully!');
    });
}

function updateUserPriorityDisplay() {
    const resourceType = document.getElementById('userResourceType').value;
    const severity = parseInt(document.getElementById('userSeverity').value) || 0;
    const individualsAffected = parseInt(document.getElementById('userIndividualsAffected').value) || 0;

    if (!resourceType) {
        const badge = document.getElementById('userPriorityBadge');
        if (badge) {
            badge.className = 'priority-badge priority-low';
            badge.textContent = 'LOW';
        }
        const confidence = document.getElementById('userPriorityConfidence');
        if (confidence) confidence.textContent = 'Confidence: 0%';
        return;
    }

    const result = calculateMLPriority(resourceType, individualsAffected, severity);

    const badge = document.getElementById('userPriorityBadge');
    if (badge) {
        badge.className = 'priority-badge priority-' + result.priorityClass;
        badge.textContent = result.priorityClass.toUpperCase();
    }

    const confidence = document.getElementById('userPriorityConfidence');
    if (confidence) confidence.textContent = 'Confidence: ' + result.mlConfidence + '%';
}

function calculateMLPriority(resourceType, individualsAffected, severity) {
    let priorityClass = 'low';
    let baseScore = 0;

    // Resource-based classification
    if (resourceType === 'Ambulance' || resourceType === 'Rescue Team') {
        // Emergency response - lower threshold
        if (individualsAffected >= 25) {
            priorityClass = 'critical';
            baseScore = 120;
        } else if (individualsAffected >= 5) {
            priorityClass = 'high';
            baseScore = 70;
        } else {
            priorityClass = 'medium';
            baseScore = 40;
        }
    } else if (resourceType === 'Medical Supplies') {
        // Medical supplies - severity matters
        if (individualsAffected >= 100 || (individualsAffected >= 50 && severity >= 4)) {
            priorityClass = 'critical';
            baseScore = 110;
        } else if (individualsAffected >= 50 || (individualsAffected >= 25 && severity >= 4)) {
            priorityClass = 'high';
            baseScore = 65;
        } else if (individualsAffected >= 10) {
            priorityClass = 'medium';
            baseScore = 35;
        } else {
            priorityClass = 'low';
            baseScore = 15;
        }
    } else if (resourceType === 'Food & Water') {
        // Food - larger numbers needed
        if (individualsAffected >= 200) {
            priorityClass = 'critical';
            baseScore = 105;
        } else if (individualsAffected >= 100) {
            priorityClass = 'high';
            baseScore = 60;
        } else if (individualsAffected >= 30) {
            priorityClass = 'medium';
            baseScore = 32;
        } else {
            priorityClass = 'low';
            baseScore = 12;
        }
    } else if (resourceType === 'Shelter') {
        // Shelter - moderate thresholds
        if (individualsAffected >= 150) {
            priorityClass = 'critical';
            baseScore = 108;
        } else if (individualsAffected >= 80) {
            priorityClass = 'high';
            baseScore = 62;
        } else if (individualsAffected >= 20) {
            priorityClass = 'medium';
            baseScore = 30;
        } else {
            priorityClass = 'low';
            baseScore = 10;
        }
    }

    // Add severity weight (10% influence)
    const severityBonus = severity * 3;
    const finalScore = baseScore + severityBonus;

    // Confidence based on how clear the classification is
    const confidence = Math.min(95, 75 + Math.floor(Math.random() * 15));

    return {
        priorityClass,
        priorityScore: finalScore,
        mlConfidence: confidence
    };
}

function updatePriorityDisplay() {
    const resourceType = document.getElementById('resourceType').value;
    const severity = parseInt(document.getElementById('severity').value) || 0;
    const individualsAffected = parseInt(document.getElementById('individualsAffected').value) || 0;

    if (!resourceType) {
        const badge = document.getElementById('priorityBadge');
        badge.className = 'priority-badge priority-low';
        badge.textContent = 'LOW';
        document.getElementById('priorityConfidence').textContent = 'Confidence: 0%';
        return;
    }

    const result = calculateMLPriority(resourceType, individualsAffected, severity);

    const badge = document.getElementById('priorityBadge');
    badge.className = 'priority-badge priority-' + result.priorityClass;
    badge.textContent = result.priorityClass.toUpperCase();

    document.getElementById('priorityConfidence').textContent = 'Confidence: ' + result.mlConfidence + '%';
}

function renderRequests() {
    const activeTable = document.getElementById('activeRequestsTable');
    const resolvedTable = document.getElementById('resolvedRequestsTable');

    activeTable.innerHTML = '';
    resolvedTable.innerHTML = '';

    const activeRequests = requests.filter(r => r.status !== 'resolved');
    const resolvedRequests = requests.filter(r => r.status === 'resolved');

    activeRequests.forEach(request => {
        const truncatedDesc = request.description && request.description.length > 50
            ? request.description.substring(0, 50) + '...'
            : request.description || 'N/A';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${request.resourceType}</td>
            <td>${request.quantityAllocated || 0}/${request.quantityRequested}</td>
            <td style="font-size: 13px; max-width: 150px;">${request.address || `Lat: ${request.lat.toFixed(4)}, Lng: ${request.lng.toFixed(4)}`}</td>
            <td>${request.contactPerson || 'N/A'}</td>
            <td class="contact-phone">${request.contactPhone || 'N/A'}</td>
            <td><span class="priority-badge priority-${request.mlPriorityClass}">${request.mlPriorityClass.toUpperCase()}</span></td>
            <td><span class="status-badge status-${request.status}">${request.status.toUpperCase()}</span></td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-secondary btn-small" onclick="showRoute(${request.id})">Route</button>
                    ${currentUser.role === 'Admin' ? `
                        ${request.status !== 'allocated' ? `<button class="btn btn-primary btn-small" onclick="openAllocateModal(${request.id})">Allocate</button>` : ''}
                        ${request.status === 'allocated' ? `<button class="btn btn-primary btn-small" onclick="markResolved(${request.id})">Mark Resolved</button>` : ''}
                    ` : ''}
                </div>
            </td>
        `;
        activeTable.appendChild(row);
    });

    resolvedRequests.forEach(request => {
        const truncatedDesc = request.description && request.description.length > 50
            ? request.description.substring(0, 50) + '...'
            : request.description || 'N/A';
        const resolvedDate = request.resolvedAt
            ? new Date(request.resolvedAt).toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            })
            : 'N/A';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${request.requestId}</strong></td>
            <td>${request.resourceType}</td>
            <td>${request.quantityAllocated || 0}/${request.quantityRequested}</td>
            <td style="font-size: 13px; max-width: 150px;">${request.address || `Lat: ${request.lat.toFixed(4)}, Lng: ${request.lng.toFixed(4)}`}</td>
            <td>${request.contactPerson || 'N/A'}</td>
            <td class="contact-phone">${request.contactPhone || 'N/A'}</td>
            <td class="description-truncate" title="${request.description || 'N/A'}">${truncatedDesc}</td>
            <td><span class="priority-badge priority-${request.mlPriorityClass}">${request.mlPriorityClass.toUpperCase()}</span></td>
            <td>${resolvedDate}</td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-secondary btn-small" onclick="showRoute(${request.id})">Route</button>
                    ${currentUser.role === 'Admin' ? `<button class="btn btn-secondary btn-small" onclick="deleteRequest(${request.id})">Delete</button>` : ''}
                </div>
            </td>
        `;
        resolvedTable.appendChild(row);
    });
}

function showRoute(requestId) {
    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    if (currentRoute) {
        map.removeLayer(currentRoute);
        currentRoute = null;
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${BASE_LOCATION.lng},${BASE_LOCATION.lat};${request.lng},${request.lat}?overview=full&geometries=geojson`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.code === 'Ok' && data.routes.length > 0) {
                const route = data.routes[0];
                const distance = (route.distance / 1000).toFixed(2);
                const duration = Math.round(route.duration / 60);
                const destination = `${request.lat.toFixed(4)}, ${request.lng.toFixed(4)}`;

                // Show modal with route information
                showRouteModal(distance, duration, destination, request);

                // Draw route on map after brief delay
                setTimeout(() => {
                    const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
                    currentRoute = L.polyline(coordinates, { color: '#1a1a1a', weight: 4 }).addTo(map);

                    map.fitBounds(currentRoute.getBounds(), { padding: [50, 50] });

                    fetchWeather(request.lat, request.lng);

                    if (baseMarker) baseMarker.remove();
                    baseMarker = L.marker([BASE_LOCATION.lat, BASE_LOCATION.lng])
                        .addTo(map)
                        .bindPopup('<b>' + BASE_LOCATION.name + '</b><br>Base Location');

                    if (emergencyMarker) emergencyMarker.remove();
                    emergencyMarker = L.marker([request.lat, request.lng])
                        .addTo(map)
                        .bindPopup('<b>Emergency Location</b><br>Lat: ' + request.lat.toFixed(6) + '<br>Lng: ' + request.lng.toFixed(6));

                    if (routeTimeout) {
                        clearTimeout(routeTimeout);
                    }
                    routeTimeout = setTimeout(() => {
                        if (currentRoute) {
                            map.removeLayer(currentRoute);
                            currentRoute = null;
                        }
                        if (baseMarker) baseMarker.remove();
                        baseMarker = L.marker([BASE_LOCATION.lat, BASE_LOCATION.lng])
                            .addTo(map)
                            .bindPopup('<b>' + BASE_LOCATION.name + '</b><br>Base Location');
                        if (emergencyMarker) { emergencyMarker.remove(); emergencyMarker = null; }
                        fetchWeather(BASE_LOCATION.lat, BASE_LOCATION.lng);
                    }, 20000);
                }, 500);
            }
        })
        .catch(error => {
            console.error('Error fetching route:', error);
            alert('Unable to fetch route information.');
        });
}

function showRouteModal(distance, time, destination, request) {
    document.getElementById('routeDistance').textContent = distance + ' km';
    document.getElementById('routeTime').textContent = time + ' minutes';
    document.getElementById('routeLocation').textContent = `Lat: ${request.lat.toFixed(6)}, Lng: ${request.lng.toFixed(6)}`;
    document.getElementById('routeContact').textContent = request.contactPerson || 'N/A';
    document.getElementById('routePhone').textContent = request.contactPhone || 'N/A';
    document.getElementById('routeIndividuals').textContent = request.individualsAffected || 'N/A';
    document.getElementById('routeSeverity').textContent = request.severity || 'N/A';
    document.getElementById('routeDescription').textContent = request.description || 'No description available';
    document.getElementById('routeModal').style.display = 'flex';

    // Auto-close after 8 seconds
    if (routeModalTimeout) {
        clearTimeout(routeModalTimeout);
    }
    routeModalTimeout = setTimeout(closeRouteModal, 8000);
}

function closeRouteModal() {
    document.getElementById('routeModal').style.display = 'none';
    if (routeModalTimeout) {
        clearTimeout(routeModalTimeout);
        routeModalTimeout = null;
    }
}

function fetchWeather(lat, lng) {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${WEATHER_API_KEY}&units=metric`;
    fetch(url)
        .then(response => response.json())
        .then(data => {
            displayWeather(data);
        })
        .catch(error => {
            console.error('Error fetching weather:', error);
        });
}

function displayWeather(data) {
    const weatherSection = document.getElementById('weatherSection');
    const weatherGrid = document.getElementById('weatherGrid');

    // Helper function to convert degrees to cardinal directions
    function degToCardinal(deg) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(((deg % 360) / 45)) % 8;
        return directions[index];
    }

    const windDirection = data.wind.deg !== undefined
        ? `${degToCardinal(data.wind.deg)} (${data.wind.deg}° from North)`
        : 'N/A';

    const weatherItems = [
        { label: 'City Name', value: data.name },
        { label: 'Weather Description', value: data.weather[0].description },
        { label: 'Temperature', value: `${data.main.temp}°C` },
        { label: 'Feels Like', value: `${data.main.feels_like}°C` },
        { label: 'Humidity', value: `${data.main.humidity}%` },
        { label: 'Pressure', value: `${data.main.pressure} hPa` },
        { label: 'Wind Speed', value: `${data.wind.speed} m/s` },
        { label: 'Wind Direction', value: windDirection },
        { label: 'Visibility', value: data.visibility !== undefined ? `${(data.visibility / 1000).toFixed(1)} km` : 'N/A' },
        { label: 'Cloudiness', value: `${data.clouds.all}%` },
        { label: 'Coordinates', value: `${data.coord.lat.toFixed(6)}, ${data.coord.lon.toFixed(6)}` },
        { label: 'Timezone', value: `GMT${data.timezone >= 0 ? '+' : ''}${data.timezone / 3600}` },
    ];
    weatherGrid.innerHTML = weatherItems.map(item => `
        <div class="weather-item">
            <label>${item.label}</label>
            <div class="value">${item.value}</div>
        </div>
    `).join('');

}

function toggleWeather() {
    const content = document.getElementById('weatherContent');
    const icon = document.getElementById('weatherToggleIcon');

    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.style.transform = 'rotate(0deg)';
    } else {
        content.classList.add('expanded');
        icon.style.transform = 'rotate(180deg)';
    }
}

function toggleAIDemand() {
    const content = document.getElementById('aiDemandContent');
    const icon = document.getElementById('aiDemandToggleIcon');

    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.style.transform = 'rotate(0deg)';
    } else {
        content.classList.add('expanded');
        icon.style.transform = 'rotate(180deg)';
    }
}

function toggleMobileView() {
    const body = document.body;
    const toggleBtn = document.getElementById('mobileViewToggle');
    const icon = toggleBtn.querySelector('i');

    body.classList.toggle('mobile-view-active');
    const isMobile = body.classList.contains('mobile-view-active');

    if (isMobile) {
        icon.className = 'fas fa-desktop';
        localStorage.setItem('mobileViewActive', 'true');
        if (map) map.scrollWheelZoom.disable();
    } else {
        icon.className = 'fas fa-mobile-alt';
        localStorage.setItem('mobileViewActive', 'false');
        if (map) map.scrollWheelZoom.enable();
    }
}

// Initialize mobile view state on page load
function initMobileViewState() {
    const isMobileView = localStorage.getItem('mobileViewActive') === 'true';
    const body = document.body;
    const toggleBtn = document.getElementById('mobileViewToggle');

    if (isMobileView && toggleBtn) {
        body.classList.add('mobile-view-active');
        toggleBtn.querySelector('i').className = 'fas fa-desktop';
    }
}

// Call on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileViewState);
} else {
    initMobileViewState();
}

function toggleUserResources() {
    const content = document.getElementById('userResourcesContent');
    const icon = document.getElementById('userResourcesToggleIcon');

    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.style.transform = 'rotate(0deg)';
    } else {
        content.classList.add('expanded');
        icon.style.transform = 'rotate(180deg)';
    }
}



function openAllocateModal(requestId) {
    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    // Set form fields
    document.getElementById('allocateRequestId').value = request.id;
    document.getElementById('allocateQuantity').value = '';
    document.getElementById('allocateQuantity').max = request.quantityPending;

    // Set info display fields
    document.getElementById('allocateRequestIdInfo').textContent = request.requestId;
    document.getElementById('allocateResourceTypeInfo').textContent = request.resourceType;
    document.getElementById('allocateQuantityInfo').textContent = request.quantityRequested;
    document.getElementById('allocateContactInfo').textContent = request.contactPerson || 'N/A';
    document.getElementById('allocatePhoneInfo').textContent = request.contactPhone || 'N/A';
    document.getElementById('allocateLocationInfo').textContent = `Lat: ${request.lat.toFixed(6)}, Lng: ${request.lng.toFixed(6)}`;
    document.getElementById('allocateIndividualsInfo').textContent = request.individualsAffected || 'N/A';
    document.getElementById('allocateSeverityInfo').textContent = request.severity || 'N/A';
    document.getElementById('allocatePriorityInfo').textContent = request.mlPriorityClass ? request.mlPriorityClass.toUpperCase() : 'N/A';
                    document.getElementById('allocateDescriptionInfo').textContent = request.description || 'No description available';

    document.getElementById('allocateModal').style.display = 'flex';
}

function closeAllocateModal() {
    document.getElementById('allocateModal').style.display = 'none';
}

document.getElementById('allocateForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const requestId = parseInt(document.getElementById('allocateRequestId').value);
    const allocateQty = parseInt(document.getElementById('allocateQuantity').value);

    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    const resource = resources.find(r => r.type === request.resourceType);
    if (!resource) {
        alert('Resource type not found!');
        return;
    }

    if (allocateQty > resource.availableQuantity) {
        alert(`Insufficient resources! Available: ${resource.availableQuantity}`);
        return;
    }

    if (allocateQty > request.quantityPending) {
        alert(`Allocation exceeds pending quantity! Pending: ${request.quantityPending}`);
        return;
    }

    resource.availableQuantity -= allocateQty;
    request.quantityAllocated = (request.quantityAllocated || 0) + allocateQty;
    request.quantityPending -= allocateQty;

    if (request.quantityPending === 0) {
        request.status = 'allocated';
    } else {
        request.status = 'partial';
    }

    closeAllocateModal();
    renderRequests();
    renderResources();
    updateStats();
    if (currentUser.role === 'Admin') {
        updateAnalytics();
    }

    alert('Resources allocated successfully!');
});

function markResolved(requestId) {
    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    if (confirm(`Mark request ${request.requestId} as resolved?`)) {
        request.status = 'resolved';
        request.resolvedAt = new Date().toISOString();
        renderRequests();
        updateStats();
        if (currentUser.role === 'Admin') {
            updateAnalytics();
        }
    }
}

function deleteRequest(requestId) {
    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    if (confirm(`Delete request ${request.requestId}?`)) {
        requests = requests.filter(r => r.id !== requestId);
        renderRequests();
        updateStats();
        if (currentUser.role === 'Admin') {
            updateAnalytics();
        }
    }
}

function renderResources(gridId = 'resourcesGrid') {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';

    resources.forEach(resource => {
        const percentage = (resource.availableQuantity / resource.totalQuantity * 100).toFixed(0);
        const card = document.createElement('div');
        card.className = 'resource-card';
        card.innerHTML = `
            <h3>${resource.name} <span style="font-weight: 400; color: #6d8b74;">(${resource.type.toLowerCase()})</span></h3>
            <div class="resource-bar">
                <div class="resource-bar-fill" style="width: ${percentage}%"></div>
            </div>
            <div class="resource-stats">
                <span>Available: ${resource.availableQuantity}</span>
                <span>Total: ${resource.totalQuantity}</span>
            </div>
            ${currentUser.role === 'Admin' ? `
                <div class="btn-group" style="margin-top: 12px;">
                    <button class="btn btn-edit btn-small" onclick="openEditResourceModal(${resource.id})">Edit</button>
                    <button class="btn btn-secondary btn-small" onclick="deleteResource(${resource.id})">Delete</button>
                </div>
            ` : ''}
        `;
        grid.appendChild(card);
    });
}

function openAddResourceModal() {
    document.getElementById('resourceModalTitle').textContent = 'Add Resource';
    document.getElementById('resourceForm').reset();
    document.getElementById('resourceId').value = '';
    document.getElementById('resourceModal').style.display = 'flex';
}

function openEditResourceModal(resourceId) {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;

    document.getElementById('resourceModalTitle').textContent = 'Edit Resource';
    document.getElementById('resourceId').value = resource.id;
    document.getElementById('resourceName').value = resource.name;
    document.getElementById('resourceTypeSelect').value = resource.type;
    document.getElementById('resourceTotal').value = resource.totalQuantity;
    document.getElementById('resourceAvailable').value = resource.availableQuantity;

    document.getElementById('resourceModal').style.display = 'flex';
}

function editResource(resourceId) {
    openEditResourceModal(resourceId);
}

function closeResourceModal() {
    document.getElementById('resourceModal').style.display = 'none';
}

document.getElementById('resourceForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const resourceId = document.getElementById('resourceId').value;
    const name = document.getElementById('resourceName').value;
    const type = document.getElementById('resourceTypeSelect').value;
    const total = parseInt(document.getElementById('resourceTotal').value);
    const available = parseInt(document.getElementById('resourceAvailable').value);

    if (available > total) {
        alert('Available quantity cannot exceed total quantity!');
        return;
    }

    if (resourceId) {
        const resource = resources.find(r => r.id === parseInt(resourceId));
        if (resource) {
            resource.name = name;
            resource.type = type;
            resource.totalQuantity = total;
            resource.availableQuantity = available;
        }
    } else {
        const newResource = {
            id: resources.length > 0 ? Math.max(...resources.map(r => r.id)) + 1 : 1,
            name,
            type,
            totalQuantity: total,
            availableQuantity: available
        };
        resources.push(newResource);
    }

    closeResourceModal();
    renderResources();
    if (currentUser.role === 'Admin') {
        updateAnalytics();
    }
});

function deleteResource(resourceId) {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;

    if (confirm(`Delete resource "${resource.name}"?`)) {
        resources = resources.filter(r => r.id !== resourceId);
        renderResources();
        if (currentUser.role === 'Admin') {
            updateAnalytics();
        }
    }
}

function updateStats() {
    const total = requests.length;
    const active = requests.filter(r => r.status !== 'resolved').length;
    const resolved = requests.filter(r => r.status === 'resolved').length;
    const critical = requests.filter(r => r.mlPriorityClass === 'critical').length;

    document.getElementById('totalRequests').textContent = total;
    document.getElementById('activeRequests').textContent = active;
    document.getElementById('resolvedRequests').textContent = resolved;
    document.getElementById('criticalRequests').textContent = critical;
}

function updateAnalytics() {
    if (requests.length === 0) return;

    const avgPriority = (requests.reduce((sum, r) => sum + r.priorityScore, 0) / requests.length).toFixed(1);
    const totalIndividuals = requests.reduce((sum, r) => sum + r.individualsAffected, 0);

    const totalResourceCapacity = resources.reduce((sum, r) => sum + r.totalQuantity, 0);
    const totalResourceAvailable = resources.reduce((sum, r) => sum + r.availableQuantity, 0);
    const utilization = ((1 - totalResourceAvailable / totalResourceCapacity) * 100).toFixed(0);

    document.getElementById('avgPriority').textContent = avgPriority;
    document.getElementById('totalIndividuals').textContent = totalIndividuals;
    document.getElementById('resourceUtilization').textContent = utilization + '%';
    document.getElementById('avgResponseTime').textContent = 'N/A';
    
    updateInventoryForecasting();
}

// Sort requests by risk level
function handleRiskSort(sortValue) {
    if (sortValue === 'critical') {
        // High Score = Critical/High Risk -> Sort Descending
        requests.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    } else if (sortValue === 'low') {
        // Low Score = Low Risk -> Sort Ascending
        requests.sort((a, b) => (a.priorityScore || 0) - (b.priorityScore || 0));
    }
    renderRequests();
}

let sheetRefreshInterval = null;

function initSheetRefresh() {
    if (sheetRefreshInterval) clearInterval(sheetRefreshInterval);

    // Refresh every 60 seconds
    const interval = 60000;

    sheetRefreshInterval = setInterval(() => {
        const iframe = document.getElementById('liveSheetFrame');
        if (iframe && iframe.parentElement.offsetParent !== null) { // Check if visible
            // Reload iframe
            iframe.src = iframe.src;

            // Brief status update
            const badge = document.getElementById('sheetRefreshStatus');
            if (badge) {
                badge.textContent = 'Refreshing...';
                badge.className = 'status-badge status-allocated'; // Blueish
                setTimeout(() => {
                    badge.textContent = 'Auto-refresh active';
                    badge.className = 'status-badge status-pending'; // Yellowish/Default
                }, 2000);
            }
        }
    }, interval);
}

// SOS Panic Feature
async function sendSOS() {
    if (!confirm("🚨 ARE YOU SURE? This will send an immediate SOS alert with your current location to the emergency response team.")) {
        return;
    }

    const sosButton = document.querySelector('.btn-sos');
    const originalContent = sosButton.innerHTML;
    sosButton.disabled = true;
    sosButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>...</span>';

    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser. Please submit a manual request.");
        sosButton.disabled = false;
        sosButton.innerHTML = originalContent;
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        const newRequest = {
            id: requests.length + 1,
            requestId: `SOS-${Date.now().toString().slice(-4)}`,
            resourceType: "CRITICAL SOS",
            quantityRequested: 1,
            quantityAllocated: 0,
            quantityPending: 1,
            lat: lat,
            lng: lng,
            severity: 5,
            individualsAffected: 1,
            status: 'pending',
            priorityScore: 150.0, // Absolute maximum priority
            mlPriorityClass: 'critical',
            mlConfidence: 0.99,
            contactPerson: currentUser ? (currentUser.fullName || currentUser.username) : "Anonymous User",
            contactPhone: "GEO-LOCATED",
            description: "🚨 EMERGENCY SOS: User has triggered a panic alert from their mobile device. Immediate response required at GPS coordinates."
        };

        // Add to local state
        requests.unshift(newRequest); // Add to top

        // Update UI
        if (currentUser.role === 'Admin') {
            renderRequests();
            updateStats();
            updateAnalytics();
        }

        // Send Telegram Alert
        const botToken = "8683344314:AAETE34zer-DgxDcDqa56Vi_sJ8MQeCSRQc";
        const chatID = "7988893018";
        const msg = `🚨 *CRITICAL SOS ALERT*\n\nUser: ${newRequest.contactPerson}\nLocation: https://www.google.com/maps?q=${lat},${lng}\nStatus: IMMEDIATE RESPONSE REQUIRED`;
        
        try {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatID,
                    text: msg,
                    parse_mode: 'Markdown'
                })
            });
        } catch (err) {
            console.error("Telegram SOS failed:", err);
        }

        alert("🚨 SOS ALERT SENT! Emergency teams have been notified of your location. Please stay where you are if safe.");
        
        sosButton.disabled = false;
        sosButton.innerHTML = originalContent;

        // Visual feedback on the map
        if (map) {
            if (emergencyMarker) map.removeLayer(emergencyMarker);
            emergencyMarker = L.marker([lat, lng]).addTo(map)
                .bindPopup('<b>🚨 SOS LOCATION</b>').openPopup();
            map.setView([lat, lng], 15);
        }

    }, (error) => {
        let errorMsg = "Unable to retrieve your location.";
        switch(error.code) {
            case error.PERMISSION_DENIED:
                errorMsg = "User denied the request for Geolocation. Please enable location permissions.";
                break;
            case error.POSITION_UNAVAILABLE:
                errorMsg = "Location information is unavailable.";
                break;
            case error.TIMEOUT:
                errorMsg = "The request to get user location timed out.";
                break;
        }
        alert(errorMsg);
        sosButton.disabled = false;
        sosButton.innerHTML = originalContent;
    }, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });
}

// Tactical Mode (Night Vision) Toggle
function toggleTacticalMode() {
    document.body.classList.toggle('tactical-mode');
    const isActive = document.body.classList.contains('tactical-mode');
    localStorage.setItem('tacticalMode', isActive);
    
    updateTacticalUI(isActive);
}

function updateTacticalUI(isActive) {
    const btns = [document.getElementById('tacticalToggleAdmin'), document.getElementById('tacticalToggleUser')];
    btns.forEach(btn => {
        if (btn) {
            btn.querySelector('span').textContent = isActive ? 'Normal Mode' : 'Tactical Mode';
            btn.querySelector('i').className = isActive ? 'fas fa-eye-slash' : 'fas fa-eye';
            btn.style.color = isActive ? '#fff' : '#ff0000';
            btn.style.background = isActive ? '#900' : '#333';
        }
    });
}

// Initialize Tactical Mode on page load
function initTacticalMode() {
    const isTactical = localStorage.getItem('tacticalMode') === 'true';
    if (isTactical) {
        document.body.classList.add('tactical-mode');
        updateTacticalUI(true);
    }
}

// Add to DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    initTacticalMode();
    initLanguage();
});

// --- Multilingual Support ---
const TRANSLATIONS = {
    en: {
        title: "ResQ Link",
        base: "Base: Vidya Vardhaka College of Engineering",
        hw_title: "Live Hardware Monitoring (Supabase)",
        temp: "Temperature",
        hum: "Humidity",
        soil: "Soil Moisture",
        water: "Water Level",
        seismic: "Seismic Activity",
        air: "Air Quality",
        rain: "Rain Intensity",
        submit_req: "Submit Emergency Request",
        res_type: "Resource Type",
        qty: "Quantity",
        severity: "Severity (1-5)",
        affected: "Individuals Affected",
        desc: "Description",
        submit_btn: "Submit Request",
        sos_btn: "SOS",
        sos_label: "Instant Emergency Help",
        logout: "Logout",
        active_req: "Active Emergency Requests",
        resolved_req: "Resolved Requests",
        avail_res: "Available Resources"
    },
    kn: {
        title: "ರೆಸ್ಕ್ಯೂ ಲಿಂಕ್",
        base: "ನೆಲೆ: ವಿದ್ಯಾವರ್ಧಕ ಎಂಜಿನಿಯರಿಂಗ್ ಕಾಲೇಜು",
        hw_title: "ಲೈವ್ ಹಾರ್ಡ್‌ವೇರ್ ಮಾನಿಟರಿಂಗ್ (ಸುಪಬೇಸ್)",
        temp: "ತಾಪಮಾನ",
        hum: "ಆರ್ದ್ರತೆ",
        soil: "ಮಣ್ಣಿನ ತೇವಾಂಶ",
        water: "ನೀರಿನ ಮಟ್ಟ",
        seismic: "ಭೂಕಂಪನ ಚಟುವಟಿಕೆ",
        air: "ಗಾಳಿಯ ಗುಣಮಟ್ಟ",
        rain: "ಮಳೆಯ ತೀವ್ರತೆ",
        submit_req: "ತುರ್ತು ವಿನಂತಿಯನ್ನು ಸಲ್ಲಿಸಿ",
        res_type: "ಸಂಪನ್ಮೂಲ ಪ್ರಕಾರ",
        qty: "ಪ್ರಮಾಣ",
        severity: "ತೀವ್ರತೆ (1-5)",
        affected: "ಪೀಡಿತ ವ್ಯಕ್ತಿಗಳು",
        desc: "ವಿವರಣೆ",
        submit_btn: "ವಿನಂತಿಯನ್ನು ಸಲ್ಲಿಸಿ",
        sos_btn: "ಎಸ್ಒಎಸ್",
        sos_label: "ತತ್ಕ್ಷಣ ತುರ್ತು ಸಹಾಯ",
        logout: "ನಿರ್ಗಮಿಸಿ",
        active_req: "ಸಕ್ರಿಯ ತುರ್ತು ವಿನಂತಿಗಳು",
        resolved_req: "ಪರಿಹರಿಸಲಾದ ವಿನಂತಿಗಳು",
        avail_res: "ಲಭ್ಯವಿರುವ ಸಂಪನ್ಮೂಲಗಳು"
    }
};

let currentLang = 'en';

function toggleLanguage() {
    currentLang = currentLang === 'en' ? 'kn' : 'en';
    localStorage.setItem('resqlink_lang', currentLang);
    applyLanguage(currentLang);
}

function applyLanguage(lang) {
    const t = TRANSLATIONS[lang];
    
    // Update main titles
    document.querySelectorAll('h1').forEach(el => {
        if (el.textContent.includes("ResQ Link") || el.textContent.includes("ರೆಸ್ಕ್ಯೂ ಲಿಂಕ್")) el.textContent = t.title;
    });

    document.querySelectorAll('span').forEach(el => {
        if (el.textContent.includes("Vidya Vardhaka") || el.textContent.includes("ವಿದ್ಯಾವರ್ಧಕ")) el.textContent = t.base;
    });

    // Update Headers
    const hwHeaders = document.querySelectorAll('h2');
    hwHeaders.forEach(h => {
        if (h.textContent.includes("Hardware Monitoring") || h.textContent.includes("ಹಾರ್ಡ್‌ವೇರ್ ಮಾನಿಟರಿಂಗ್")) {
            h.innerHTML = `<i class="fas fa-microchip" style="color: #c85a54;"></i> ${t.hw_title}`;
        }
        if (h.textContent.includes("Emergency Request") || h.textContent.includes("ವಿನಂತಿಯನ್ನು ಸಲ್ಲಿಸಿ")) {
            h.textContent = t.submit_req;
        }
        if (h.textContent.includes("Available Resources") || h.textContent.includes("ಸಂಪನ್ಮೂಲಗಳು")) {
            h.innerHTML = `<i class="fas fa-boxes"></i> ${t.avail_res}`;
        }
    });

    // Update Labels
    const labels = document.querySelectorAll('label');
    labels.forEach(l => {
        if (l.textContent === "Resource Type") l.textContent = t.res_type;
        if (l.textContent === "Quantity") l.textContent = t.qty;
        if (l.textContent.includes("Severity")) l.textContent = t.severity;
        if (l.textContent === "Individuals Affected") l.textContent = t.affected;
        if (l.textContent === "Description") l.textContent = t.desc;
    });

    // Update Hardware Cards
    const hwCards = {
        'hwCardTemp': t.temp,
        'hwCardHum': t.hum,
        'hwCardSoil': t.soil,
        'hwCardWater': t.water,
        'hwCardSeismic': t.seismic,
        'hwCardAir': t.air,
        'hwCardRain': t.rain
    };

    for (const [id, label] of Object.entries(hwCards)) {
        const card = document.getElementById(id);
        if (card) {
            const h3 = card.querySelector('h3');
            if (h3) h3.textContent = label;
        }
    }

    // Update Buttons
    const sosBtns = document.querySelectorAll('.btn-sos span');
    sosBtns.forEach(btn => btn.textContent = t.sos_btn);
    
    const sosLabels = document.querySelectorAll('.sos-label');
    sosLabels.forEach(l => l.textContent = t.sos_label);

    const submitBtns = document.querySelectorAll('button[type="submit"]');
    submitBtns.forEach(btn => {
        if (btn.textContent.includes("Submit Request") || btn.textContent.includes("ವಿನಂತಿಯನ್ನು ಸಲ್ಲಿಸಿ")) {
            btn.textContent = t.submit_btn;
        }
    });

    const logoutBtns = document.querySelectorAll('.btn-logout');
    logoutBtns.forEach(btn => btn.textContent = t.logout);

    // Update Toggle Buttons
    const langBtns = [document.getElementById('langToggleAdmin'), document.getElementById('langToggleUser')];
    langBtns.forEach(btn => {
        if (btn) btn.querySelector('span').textContent = lang === 'en' ? 'ಕನ್ನಡ' : 'English';
    });
}

function initLanguage() {
    const savedLang = localStorage.getItem('resqlink_lang');
    if (savedLang) {
        currentLang = savedLang;
        applyLanguage(currentLang);
    }
}

// Volunteer Management Logic
function registerVolunteer(event) {
    event.preventDefault();
    
    const name = document.getElementById('volName').value;
    const role = document.getElementById('volRole').value;
    const phone = document.getElementById('volPhone').value;

    const newVol = {
        id: volunteers.length + 1,
        name: name,
        role: role,
        phone: phone,
        status: 'available',
        lat: BASE_LOCATION.lat + (Math.random() - 0.5) * 0.05,
        lng: BASE_LOCATION.lng + (Math.random() - 0.5) * 0.05
    };

    volunteers.push(newVol);
    alert(`Thank you ${newVol.name}! You are now registered as a ${newVol.role} volunteer. Your location has been pinned.`);
    document.getElementById('volunteerForm').reset();
    
    if (currentUser.role === 'Admin') {
        renderVolunteers();
    }
    updateVolunteerMarkers();
}

function renderVolunteers() {
    const table = document.getElementById('volunteerTable');
    if (!table) return;
    table.innerHTML = '';

    volunteers.forEach(v => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${v.name}</strong></td>
            <td>${v.role}</td>
            <td><span class="status-badge status-${v.status}">${v.status.toUpperCase()}</span></td>
            <td>${v.phone}</td>
            <td>
                <button class="btn btn-primary btn-small" onclick="dispatchVolunteer(${v.id})">Dispatch</button>
            </td>
        `;
        table.appendChild(row);
    });
}

function updateVolunteerMarkers() {
    if (!map) return;
    
    volunteers.forEach(v => {
        const icon = L.divIcon({
            className: 'volunteer-marker',
            html: `<div style="background: ${v.status === 'available' ? '#10b981' : '#f59e0b'}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px rgba(0,255,100,0.5);"></div>`,
            iconSize: [14, 14]
        });

        L.marker([v.lat, v.lng], { icon: icon })
            .addTo(map)
            .bindPopup(`<b>Volunteer: ${v.name}</b><br>Role: ${v.role}<br>Status: ${v.status}`);
    });
}

function dispatchVolunteer(volId) {
    const vol = volunteers.find(v => v.id === volId);
    if (!vol) return;
    
    const activeRequests = requests.filter(r => r.status === 'pending');
    if (activeRequests.length === 0) {
        alert("No pending requests to dispatch to.");
        return;
    }

    const req = activeRequests[0];
    vol.status = 'busy';
    alert(`Dispatched ${vol.name} to ${req.requestId} at ${req.resourceType} location.`);
    
    renderVolunteers();
    updateVolunteerMarkers();
}

// Inventory Forecasting Logic
function updateInventoryForecasting() {
    const grid = document.getElementById('forecastingGrid');
    if (!grid) return;
    grid.innerHTML = '';

    resources.forEach(res => {
        // Calculate burn rate based on requests (simulated)
        const relevantRequests = requests.filter(r => r.resourceType === res.type);
        const hourlyRate = (relevantRequests.length * 0.8) + (Math.random() * 2); 
        
        const hoursLeft = hourlyRate > 0 ? (res.availableQuantity / hourlyRate).toFixed(1) : "∞";
        const status = hoursLeft < 12 ? "critical" : (hoursLeft < 24 ? "high" : "low");

        const card = document.createElement('div');
        card.className = `ai-demand-card forecast-${status}`;
        card.style.padding = '15px';
        card.style.borderRadius = '12px';
        card.style.borderLeft = '5px solid ' + (status === 'critical' ? '#ff4444' : (status === 'high' ? '#ff8800' : '#00ff88'));
        
        card.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 5px;"><i class="fas fa-hourglass-half"></i> ${res.name}</div>
            <div style="font-size: 24px; font-weight: 800; color: var(--color-primary);">${hoursLeft} <span style="font-size: 14px;">hrs left</span></div>
            <div style="font-size: 12px; margin-top: 5px;">
                Burn Rate: ~${hourlyRate.toFixed(1)} units/hr<br>
                <span class="status-badge status-${status}">${status.toUpperCase()} RISK</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function toggleVolunteerForm() {
    const content = document.getElementById('volunteerContent');
    const icon = document.getElementById('volunteerToggleIcon');
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.style.transform = 'rotate(0deg)';
    } else {
        content.classList.add('expanded');
        icon.style.transform = 'rotate(180deg)';
    }
}

// ResqLink AI Assistant (Ollama)
async function getAISummary() {
    const output = document.getElementById('aiSummaryOutput');
    const loader = document.getElementById('aiLoader');
    
    if (!output || !loader) return;

    // Gather latest sensor data from the UI
    const sensorData = {
        temperature: document.getElementById('hwTemp').textContent,
        humidity: document.getElementById('hwHum').textContent,
        soil: document.getElementById('hwSoil').textContent,
        water: document.getElementById('hwWater').textContent,
        seismic: document.getElementById('hwSeismic').textContent,
        air: document.getElementById('hwAir').textContent,
        rain: document.getElementById('hwRain').textContent,
        lastUpdate: document.getElementById('hwLastUpdate').textContent
    };

    loader.style.display = 'flex';
    output.style.opacity = '0.5';
    output.textContent = "Analyzing patterns...";

    try {
        const response = await fetch('/ai-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sensorData })
        });
        
        const data = await response.json();
        if (data.summary) {
            output.textContent = data.summary;
        } else {
            output.textContent = "AI could not generate a summary at this time.";
        }
        output.style.opacity = '1';
    } catch (error) {
        console.error("AI Assistant Error:", error);
        output.textContent = "Offline: Please ensure Ollama is running locally with 'qwen3:8b'.";
        output.style.opacity = '1';
    } finally {
        loader.style.display = 'none';
    }
}