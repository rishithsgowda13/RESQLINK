# ResQ Link 🚨
### *A Centralized, Real-Time Hardware-to-Cloud Disaster Resource Management System & Tactical Command Center*

---

> [!IMPORTANT]
> **ResQ Link** bridges the critical gap between disaster victims, on-the-ground first responders, and centralized emergency headquarters. By integrating **physical ESP32 sensor grids**, real-time databases (**Supabase**), localized **Large Language Models (Ollama)**, and autonomous communication bots (**Telegram**), ResQ Link provides full-spectrum operational visibility when seconds count.

---

## 🗺️ System Architecture Infographic
The diagram below details the entire data orchestration loop, tracing physical environments through hardware sensors, wireless telemetry pipelines, real-time databases, and localized AI tactical analysis.

```mermaid
graph TD
    %% Hardware Tier
    subgraph Hardware Tier [Field Sensor Grid]
        DHT11["DHT11 (Temp & Humidity)"] -->|GPIO 14| ESP32["ESP32 DevKit V1"]
        MPU6050["MPU6050 (Seismic/Accel)"] -->|I2C SDA/SCL| ESP32
        MQ["MQ-Series (Gas & Smoke)"] -->|GPIO 32 (Analog)| ESP32
        RAIN["Precipitation Sensor"] -->|GPIO 33 (Analog)| ESP32
        WATER["Water Level Sensor"] -->|GPIO 34 (Analog)| ESP32
        SOIL["Soil Moisture Sensor"] -->|GPIO 35 (Analog)| ESP32
    end

    %% Network / Cloud Tier
    subgraph Cloud & Transmission Tier [Data Pipelines]
        ESP32 -->|HTTPS POST JSON| Supabase["Supabase DB (sensor_logs)"]
        ESP32 <-->|HTTPS Bot Requests| Telegram["Telegram API Bot"]
        Telegram <-->|Secure Channel / Alerts| Teams["Response Teams & Field Officers"]
    end

    %% Software Tier
    subgraph Software Tier [Command Center Engine]
        Node["Node.js Local Server (Port 7070)"] -->|Load Keys| Env[".env Configuration"]
        Supabase -->|Websockets Realtime Client| WebUI["Leaflet.js Central Dashboard"]
        Node <-->|Post Telemetry| WebUI
        WebUI -->|Request Tactical Summary| Node
        Node <-->|Local API Inference| Ollama["Ollama LLM (qwen3:8b)"]
        Mobile["Mobile View (SOS Panic Button)"] -->|HTML5 Geolocation| WebUI
        WebUI -->|Instant Telegram Alert Push| Telegram
    end

    %% Styling
    classDef hw fill:#fee2e2,stroke:#ef4444,stroke-width:2px,color:#991b1b;
    classDef cloud fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#1e40af;
    classDef sw fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#166534;
    class ESP32,DHT11,MPU6050,MQ,RAIN,WATER,SOIL hw;
    class Supabase,Telegram,Teams cloud;
    class Node,WebUI,Ollama,Mobile,Env sw;
```

---

## 🔌 Hardware Ecosystem Specs & Pin Mapping
The physical sensor node is built on the **ESP32 microcontroller architecture** and runs a low-latency C++ firmware loop. It utilizes a comprehensive multi-sensor array to actively capture thermal, geological, hydrological, chemical, storm, and position-tracking conditions.

### ESP32 Pin Assignment & Technical Specifications

| Sensor / Component | Physical Model | Connection Interface | ESP32 GPIO | Operating Ranges | Primary Target Metric |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Microcontroller** | ESP32 DevKit V1 | Core CPU / RF | N/A | 3.3V / 80mA (Avg) | Wireless JSON payload shipping, I/O routing |
| **Temp & Humidity** | DHT11 | Digital Single-Bus | **GPIO 14** *(Boot-Safe)* | 0°C to 50°C (±2°C) / 20–90% RH | Severe heat index tracking & fire initiation |
| **Seismic Sensor** | MPU6050 | I2C (SDA/SCL) | **GPIO 21 (SDA) / GPIO 22 (SCL)** | ±8g Accelerometer, 21Hz LPF | Landslide, structural collapse, earthquake detection |
| **Storm Predictor** | BMP280 / BME280 | I2C (SDA/SCL) | **GPIO 21 (SDA) / GPIO 22 (SCL)** | 300 to 1100 hPa / ±1 hPa precision | Low-pressure cyclonic storm fronts and altitude changes |
| **GPS Tracker** | NEO-6M / NEO-8M | UART Serial | **GPIO 16 (RX2) / GPIO 17 (TX2)** | 9600 Baud / UART interface | Live coordinate plotting without hardcoded latitude/longitude |
| **Air Quality** | MQ-Series (e.g. MQ-2)| Analog ADC | **GPIO 32** | 0 - 4095 ADC units | Toxic gas, hazardous smoke, or fire emission |
| **Rain Sensor** | Resistive Grid | Analog ADC | **GPIO 33** | 0 - 4095 ADC units *(Inverted Logic)* | Flash rain monitoring and severe precipitation |
| **Flood Sensor** | Parallel Trace | Analog ADC | **GPIO 34** | 0 - 4095 ADC units | Rising flood waters, reservoir monitoring |
| **Soil Saturation** | Dual Probe | Analog ADC | **GPIO 35** | 0 - 4095 ADC units | Ground stability & prolonged agricultural drought |
| **Wind Speed** | Pulse Anemometer | Analog / Pulse ADC | **GPIO 36** | 0 to 120 km/h wind velocity | Severe storm, hurricane, and cyclone wind tracing |
| **Wind Heading** | Wind Vane | Analog ADC | **GPIO 39** | 0 to 360 degree wind coordinates | High-altitude storm cells and cyclone heading vectors |

---

## ⚡ Disaster Detection Logic & Severity Matrix
The firmware runs a deterministic local rule engine to dynamically classify sensory alerts. When anomalies bypass safety margins, notifications are instantly pushed to emergency personnel via the **Telegram Alert Channel**.

| Status Classification | Sensor Source | Trigger Threshold / Logic Condition | Urgency Rating | Automated Telegram Notification Output |
| :--- | :--- | :--- | :--- | :--- |
| 🚨 **Earthquake Alert** | MPU6050 | Seismic magnitude $v = \sqrt{a_x^2 + a_y^2 + a_z^2} > 15.0 \, m/s^2$ | **CRITICAL** | `🚨 ResqLink Alert: Earthquake Alert detected at site! Location: Lat 12.3168, Lng 76.6135` |
| 🌪️ **Storm Alert** | Anemometer | Wind speed velocity $> 60.0 \, km/h$ | **HIGH** | `🚨 ResqLink Alert: Storm Alert (High Winds) detected at site!` |
| 🌊 **Flood Alert** | Water Level | Liquid contact reading $> 2000$ ADC | **HIGH** | `🚨 ResqLink Alert: Flood Alert detected at site!` |
| 💨 **Smoke/Gas Alert** | MQ Gas | Chemical concentration reading $> 1500$ ADC | **HIGH** | `🚨 ResqLink Alert: Smoke/Gas Alert detected at site!` |
| 🎈 **Barometric Warning** | BMP280 | Pressure falls below normal $< 990.0 \, hPa$ | **HIGH** | `🚨 ResqLink Alert: Barometric Storm Warning detected at site!` |
| 🌧️ **Heavy Rain Alert** | Rain Sensor | Precipitation reading `(4095 - PinVal)` $> 2500$ ADC | **MEDIUM** | `🚨 ResqLink Alert: Heavy Rain Alert detected at site!` |
| 🏜️ **Drought Alert** | Temp & Soil | Temperature $> 45^\circ\text{C}$ AND Soil Moisture $> 3800$ ADC | **MEDIUM** | `🚨 ResqLink Alert: Drought detected at site!` |
| 🟢 **System Updated** | All Sensors | Values are within safety margins and active tolerances | **NORMAL** | *(Silent state updates pushed directly to Supabase)* |

---

## 📈 Adaptive Power Saving & Network Transmission Logic
To ensure structural resilience in grid-down scenarios where battery reserves are finite, the ESP32 employs an **Adaptive Hysteresis and Throttling State Machine**. Rather than transmitting constant telemetry blocks, the firmware sleeps dynamically based on variance thresholds.

```mermaid
graph TD
    Start([ESP32 Power Up]) --> Init[Initialize Peripherals & Secure WiFi]
    Init --> Sync[Perform Init Sync & Telegram Initialization]
    Sync --> ReadSensors[Read Sensor Suite: Temp, Hum, Soil, Water, Air, Rain, Seismic]
    
    ReadSensors --> CheckChange{Has any sensor broken its variance threshold?}
    
    %% Yes - Major Change Detected
    CheckChange -->|YES| Major[Major Change Detected!]
    Major --> ResetTimer[Reset Active Check Interval to 5 Seconds]
    Major --> Classify[Classify Disaster Status: Flood, Fire, Earthquake, Rain, Drought]
    Major --> SyncDB[Push JSON Payload to Supabase REST API]
    Major --> BotAlert{Is Status != 'Updated'?}
    BotAlert -->|YES| TelegramAlert[Dispatch Instant Telegram SOS to Responders]
    BotAlert -->|NO| Sleep
    TelegramAlert --> Sleep
    
    %% No - Stable State
    CheckChange -->|NO| Stable[Values Stable / No Major Variance]
    Stable --> ScaleCount[Increment Same Data Count]
    ScaleCount --> ThresholdCheck{Is Same Data Count >= 3?}
    
    ThresholdCheck -->|YES (Count 3 to 5)| Throt10[Throttle Check Interval to 10 Seconds]
    ThresholdCheck -->|YES (Count >= 6)| Throt30[Enter Power-Saving IDLE MODE: 30 Seconds]
    ThresholdCheck -->|NO| Keep5[Keep Active Check Interval at 5 Seconds]
    
    Throt10 --> Sleep[Sleep for Specified Interval]
    Throt30 --> Sleep
    Keep5 --> Sleep
    
    Sleep --> ListenBot[Listen for Command Overrides /status, /help, /start]
    ListenBot --> ReadSensors
```

### Telemetry Variance Limits (Hysteresis Constraints)
A "Major Change" is defined as a sensor reading deviation that exceeds the specific thresholds below:
*   **Temperature Variance**: $\pm 0.5^\circ\text{C}$
*   **Soil Moisture Variance**: $\pm 100$ ADC units
*   **Water Level Variance**: $\pm 50.0$ ADC units
*   **Seismic Vector Acceleration**: $\pm 0.5 \, m/s^2$
*   **Air Quality MQ Value**: $\pm 50.0$ ADC units
*   **Rain Intensity Variance**: $\pm 100.0$ ADC units

---

## 🧠 Software Stack & AI-Powered Command Center
The frontend dashboard interfaces directly with the hardware infrastructure, visualizes real-time sensor activity, and manages complex response logistics.

> [!TIP]
> **Tactical Night Vision**: Emergency operators can toggle **Tactical Mode** (a high-contrast dark visual stylesheet) to prevent eye strain during zero-light search and rescue missions.

*   **🗺️ Interactive Leaflet.js Mapping**: Dynamically tracks disaster reports, geofenced boundaries, volunteers, and resource drop points.
*   **🤖 Local LLM Tactical Analysis**: Features a local Node.js middleware wrapper that triggers **Ollama AI (`qwen3:8b`)** to compile instantaneous, 2-sentence tactical summaries for incident commanders directly from the real-time sensor logs.
*   **🚨 HTML5 Geolocation SOS Panic Trigger**: Mobile-responsive dashboard features a critical **SOS Panic Button**. When tapped, it bypasses ordinary queues, sets priority status to **Absolute Critical (150.0 Priority Score)**, fetches precise GPS coordinates, and triggers an immediate Telegram alert with a direct Google Maps hyperlink.
*   **👥 Volunteer Management Matrix**: Features a registration system, role assignment (Medical, Search & Rescue, Supplies), and active dispatcher toolsets to deploy volunteers dynamically to incident sites.
*   **📦 Inventory Burn-Rate & Forecasting**: Evaluates incoming request logs to dynamically compute the exact **hours left** for critical items (water, medicine, rations). Displays remaining supply timelines classified by risk labels (**Critical <12hrs, High <24hrs, Low**).
*   **🌐 Native Kannada & English Bilingual Support**: Seamlessly toggles the entire dashboard UI between English and Kannada (`kn`) to facilitate local administration.

---

## 🛠️ Installation & Field Deployment Setup

### 1. Central Server Setup
```bash
# Clone the repository
git clone https://github.com/bharathkumar000/RESQLINK.git
cd RESQLINK

# Install dependencies
npm install

# Configure Environment Variables (.env)
cp .env.example .env
```

Ensure your `.env` contains valid credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

To run the local web dashboard:
```bash
# Start server (runs at http://localhost:7070)
npm start
```

### 2. Local AI Assistant Integration
1. Install [Ollama](https://ollama.com/) on your local terminal.
2. Download and run the high-performance AI model:
   ```bash
   ollama run qwen3:8b
   ```
3. The Node.js server automatically routes dashboard analytics to the local Ollama daemon to provide tactical emergency briefings.

### 3. ESP32 Firmware Upload
1. Open [Arduino IDE](https://www.arduino.cc/en/software).
2. Install the necessary libraries:
   *   `Adafruit_MPU6050` & `Adafruit_Sensor`
   *   `DHT sensor library`
   *   `ArduinoJson`
   *   `UniversalTelegramBot`
3. Update wifi credentials (`ssid`, `password`), `botToken`, `chatID`, `supabase_url`, and `supabase_key` in the `espcode.c++` file.
4. Select `ESP32 Dev Module` under Boards, compile, and upload to the microcontroller.

---

### 📡 Remote Telegram Controller Command List
Once the physical microcontroller is online, emergency managers can interact with the hardware node remotely by messaging the Telegram Bot:
*   `/start` — Welcomes the user and boots secure pairing sequence.
*   `/status` — Forces the ESP32 to query its physical sensor array instantly and output a formatted, real-time environment report.
*   `/help` — Returns all available options.

---
*Developed under the mission statement: **Bridging the critical gap in emergency response coordination.***
