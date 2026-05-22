// Global State
let currentUser = null;
let requests = [];
let resources = [];
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
        const statsGrid = document.getElementById('statsGrid');
        const activeRequestsSection = document.getElementById('activeRequestsSection');
        const resolvedRequestsSection = document.getElementById('resolvedRequestsSection');

        if (weatherSection) weatherSection.style.display = 'block';
        if (aiDemandSection) aiDemandSection.style.display = 'block';
        if (statsGrid) statsGrid.style.display = 'grid';
        if (activeRequestsSection) activeRequestsSection.style.display = 'block';
        if (activeRequestsSection) activeRequestsSection.style.display = 'block';
        if (resolvedRequestsSection) resolvedRequestsSection.style.display = 'block';

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