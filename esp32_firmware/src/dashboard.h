#ifndef DASHBOARD_H
#define DASHBOARD_H

// Raw HTML literal served directly from flash memory
const char html_page[] PROGMEM = R"=====(
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Emergency Rescue Dashboard</title>
    <style>
        :root {
            --bg-color: #121212;
            --card-bg: #1d1d1d;
            --text-main: #ffffff;
            --text-sec: #aaaaaa;
            --normal-color: #00bcd4;
            --danger-color: #ff4c4c;
        }
        body {
            background-color: var(--bg-color);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
        }
        .header {
            padding: 20px;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            transition: background-color 0.5s;
        }
        .header.normal { 
            background-color: var(--normal-color); 
            color: #000; 
        }
        .header.danger { 
            background-color: var(--danger-color); 
            color: #fff; 
            animation: flash 1s infinite alternate; 
        }
        @keyframes flash {
            from { opacity: 1; }
            to { opacity: 0.8; }
        }
        .container {
            padding: 20px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            max-width: 1200px;
            margin: 0 auto;
        }
        .card {
            background-color: var(--card-bg);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
        }
        .card h3 {
            margin: 0 0 10px 0;
            font-size: 16px;
            color: var(--text-sec);
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .card .value {
            font-size: 32px;
            font-weight: bold;
            margin: 10px 0;
        }
        .card .unit {
            font-size: 14px;
            color: var(--text-sec);
        }
        .status-banner {
            text-align: center;
            padding: 10px;
            font-size: 18px;
            font-weight: bold;
            margin-top: 5px;
        }
    </style>
</head>
<body>

<div id="header" class="header normal">
    RESCUE NODE 01
    <div id="status-text" class="status-banner">NORMAL STATUS</div>
</div>

<div class="container">
    <div class="card">
        <h3>Location (GPS)</h3>
        <div id="val-lat" class="value" style="font-size:18px;">WAITING...</div>
        <div id="val-lng" class="value" style="font-size:18px; margin-top:5px;"></div>
    </div>
    
    <div class="card">
        <h3>Seismic Activity</h3>
        <div id="val-seismic" class="value">0.00</div>
        <div class="unit">G-Force</div>
    </div>
    
    <div class="card">
        <h3>Rainfall Rate</h3>
        <div id="val-rain" class="value">0.0</div>
        <div class="unit">% Saturation</div>
    </div>
    
    <div class="card">
        <h3>Soil Moisture</h3>
        <div id="val-soil" class="value">0.0</div>
        <div class="unit">% Saturation</div>
    </div>
    
    <div class="card">
        <h3>Water Level</h3>
        <div id="val-water" class="value">0.0</div>
        <div class="unit">cm to sensor</div>
    </div>
</div>

<script>
    function updateData() {
        // Fetch real-time telemetry from the ESP32 data endpoint
        fetch('/data')
            .then(res => res.json())
            .then(data => {
                document.getElementById('val-seismic').innerText = parseFloat(data.seismic).toFixed(2);
                document.getElementById('val-rain').innerText = parseFloat(data.rain).toFixed(1);
                document.getElementById('val-soil').innerText = parseFloat(data.soil).toFixed(1);
                document.getElementById('val-water').innerText = parseFloat(data.water).toFixed(1);
                
                document.getElementById('val-lat').innerText = data.lat;
                document.getElementById('val-lng').innerText = data.lng;
                
                const header = document.getElementById('header');
                const statusText = document.getElementById('status-text');
                
                // Toggle theme based on Risk Engine assessment
                if(data.risk) {
                    header.className = 'header danger';
                    statusText.innerText = 'HIGH RISK (EVACUATE/WARNING)';
                } else {
                    header.className = 'header normal';
                    statusText.innerText = 'NORMAL STATUS';
                }
            })
            .catch(err => console.error('Fetch error:', err));
    }
    
    // Auto-refresh the DOM every 3 seconds without reloading the page
    updateData();
    setInterval(updateData, 3000);
</script>

</body>
</html>
)=====";

#endif
