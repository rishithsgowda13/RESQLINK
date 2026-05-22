# 📡 ResQ Link Physical Hardware & Firmware Documentation

This directory contains the physical blueprints, sensor specifications, wiring instructions, and core low-latency firmware required to build, flash, and deploy the ResQ Link Disaster Telemetry Station.

---

## 🏗️ Hardware System Overview
The ResQ Link sensor node uses an **ESP32 microcontroller** paired with a dense multi-sensor array to capture micro-climate variations, structural integrity, hydro-geological changes, and position tracking. 

```mermaid
graph TD
    %% Hardware Core
    ESP32["ESP32 DevKit V1 (Main MCU)"]
    
    %% Power
    Power["5V Power Source (Solar/USB)"] -->|VCC / GND| ESP32
    
    %% Communication Interfaces
    ESP32 <-->|I2C Protocol| BMP280["BMP280 Barometric Sensor"]
    ESP32 <-->|I2C Protocol| MPU6050["MPU6050 Accelerometer"]
    ESP32 <-->|Hardware Serial2| NEO6M["NEO-6M GPS Module"]
    
    %% Direct Digital & Analog Sensors
    DHT11["DHT11 (Temp/Hum)"] -->|GPIO 14 (One-Wire)| ESP32
    Water["Water Level Sensor"] -->|GPIO 34 (Analog)| ESP32
    Soil["Soil Moisture Probe"] -->|GPIO 35 (Analog)| ESP32
    MQ2["MQ Gas Sensor"] -->|GPIO 32 (Analog)| ESP32
    Rain["Precipitation Grid"] -->|GPIO 33 (Analog)| ESP32
    WindS["Anemometer (Wind Speed)"] -->|GPIO 36 (Analog/Pulse)| ESP32
    WindD["Wind Vane (Direction)"] -->|GPIO 39 (Analog)| ESP32
```

---

## 📌 Technical Hardware Matrix & Wiring Mappings

All physical connections must be mapped to their dedicated pins to ensure standard signal lines, I2C addresses, and boot-safe operation:

| Component | Sensor Model | Operating Voltage | Connection Type | ESP32 GPIO pin | Target Telemetry Metric | Hysteresis / Variance Trigger |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Microcontroller** | ESP32 DevKit V1 | 3.3V – 5V | CPU Core / RF | N/A | Wi-Fi Signal ($dBm$) / Loop Orchestration | N/A |
| **Thermal Sensor** | DHT11 | 3.3V – 5V | Digital Single-Bus | **GPIO 14** *(Boot-Safe)* | Ambient Temperature ($^\circ\text{C}$) / Humidity ($\%$) | $\pm 0.5^\circ\text{C}$ / $\pm 1.0\%$ |
| **Seismic Sensor** | MPU6050 | 3.3V – 5V | I2C Protocol | **GPIO 21 (SDA) / GPIO 22 (SCL)** | Real-Time Tremors & Vibrations ($m/s^2$) | $\pm 0.5 \, m/s^2$ |
| **Storm Predictor** | BMP280 | 1.8V – 3.6V | I2C Protocol | **GPIO 21 (SDA) / GPIO 22 (SCL)** | Atmospheric Pressure ($hPa$) / Altitude ($m$) | $\pm 2.0 \, hPa$ |
| **Tracking Module** | NEO-6M / NEO-8M | 2.7V – 3.6V | UART Hardware Serial | **GPIO 16 (RX2) / GPIO 17 (TX2)** | Latitude / Longitude / Absolute Speed | Dynamic / Drift |
| **Air Quality Probe** | MQ-Series (e.g. MQ-2)| 5.0V | Analog ADC | **GPIO 32** | Combustible Gas & Smoke Concentration ($ADC$) | $\pm 50.0 \, ADC$ |
| **Rain Level Sensor** | Resistive Grid | 3.3V – 5V | Analog ADC | **GPIO 33** *(Inverted)* | Rainfall Density ($ADC$) | $\pm 100.0 \, ADC$ |
| **Flood Sensor** | Parallel Water Line | 3.3V – 5V | Analog ADC | **GPIO 34** | Liquid Accumulation / Level ($ADC$) | $\pm 50.0 \, ADC$ |
| **Soil Saturation** | Resistive Probe | 3.3V – 5V | Analog ADC | **GPIO 35** | Mudslide & Landslide Soil Saturation ($ADC$) | $\pm 100.0 \, ADC$ |
| **Wind Speed (Pulse)**| Anemometer | 5.0V | Analog / Pulse ADC | **GPIO 36** | Wind Velocity ($km/h$) | $\pm 5.0 \, km/h$ |
| **Wind Angle** | Wind Vane | 5.0V | Analog ADC | **GPIO 39** | Wind Heading Direction ($Degrees$) | $\pm 15.0^\circ$ |

---

## ⚡ Disaster Alert Classifications & Scientific Logic
The low-latency rule engine evaluates sensors every cycle to flag active environments. Severe alerts bypass standard logs, triggering an immediate database push and emergency Telegram message dispatch.

```
       [ Read Hardware Telemetry ]
                    │
                    ▼
     ⚡ Evaluate Threat Condition ⚡
                    │
    ┌───────────────┼───────────────┬──────────────┬──────────────┐
    ▼               ▼               ▼              ▼              ▼
[ MQ > 1500 ]   [ v > 15.0 ]   [ w > 2000 ]   [ ws > 60.0 ]   [ P < 990 ]
    │               │               │              │              │
    ▼               ▼               ▼              ▼              ▼
💨 GAS/SMOKE    🚨 SEISMIC       🌊 FLOOD       🌪️ STORM       🎈 BARO PRESSURE
  ALERT           ALERT           ALERT          ALERT          WARNING
```

*   **Earthquake Detection**:
    *   *Trigger*: Seismic Vector Magnitude $v = \sqrt{a_x^2 + a_y^2 + a_z^2} > 15.0 \, m/s^2$
    *   *Significance*: Highly high acceleration indicates structural shift, tremor, or collapse.
*   **Flood Alarm**:
    *   *Trigger*: Water Level Sensor reading $> 2000$ ADC
    *   *Significance*: Indicates rising flood lines threatening local infrastructure.
*   **Gas & Fire Alert**:
    *   *Trigger*: MQ air index $> 1500$ ADC
    *   *Significance*: Massive presence of dangerous smoke, combustible gas, or toxic fumes.
*   **High Wind Storm Warning**:
    *   *Trigger*: Wind Speed reading $> 60.0 \, km/h$
    *   *Significance*: Approaching storm, high-gale wind hazard, or cyclone conditions.
*   **Severe Low Pressure Warning**:
    *   *Trigger*: Barometric Pressure reading $< 990.0 \, hPa$
    *   *Significance*: Approaching major low-pressure front, signifying cyclone or severe storm cells.
*   **Agricultural Drought Warning**:
    *   *Trigger*: Temperature $> 45^\circ\text{C}$ AND Soil Moisture $> 3800$ ADC (high dry resistance)
    *   *Significance*: Severe moisture deprivation endangering local crop stability.

---

## 📈 Power Efficiency: The Adaptive Throttling Algorithm
Disaster environments frequently suffer grid-down scenarios where telemetry nodes must operate on portable battery banks. To minimize transmission overhead, the node executes a dynamic sleep protocol:

1. **High Activity State (5s Check)**: 
   * Active checks run every **5 seconds**.
   * If a sensor value breaks its tolerance limit (Hysteresis Constraint), a **"Major Change"** is flagged.
   * Telemetry is uploaded immediately to Supabase and Telegram, and the active interval remains locked at 5 seconds.
2. **Dynamic Decay State (10s Check)**:
   * If no sensor breaks its tolerance limit over 3 sequential checks, the polling timer throttles up to **10 seconds** to conserve Wi-Fi transmitter battery.
3. **Deep Idle State (30s Check)**:
   * If values remain unchanged for 6 or more sequential cycles, the system enters deep **Idle Mode (30 seconds)**.
   * *Wake Override*: If any sensor reading drifts past its tolerance boundary during an idle cycle, the timer **instantly drops back to 5 seconds** and executes an immediate transmission.

---

## 💾 Upload & Installation Instructions

### Required Libraries (Arduino IDE Library Manager)
*   `Adafruit MPU6050` & `Adafruit Unified Sensor` (Geological tremors)
*   `Adafruit BMP280 Library` (Pressure & Altitude)
*   `DHT sensor library` (Temp & Humidity)
*   `ArduinoJson` (JSON Payload construction)
*   `UniversalTelegramBot` (Secure bot routing)
*   `TinyGPS++` (UART GPS processing)

### Pairing Configuration
Open [espcode.c++](espcode.c++) in this directory and customize the configuration block:
```cpp
const char* ssid = "YOUR_WIFI_NETWORK";
const char* password = "YOUR_WIFI_PASSWORD";
const char* botToken = "YOUR_TELEGRAM_BOT_TOKEN";
const char* chatID = "YOUR_TELEGRAM_CHAT_ID";
const char* supabase_url = "YOUR_SUPABASE_REST_ENDPOINT";
const char* supabase_key = "YOUR_SUPABASE_BEARER_KEY";
```

Once uploaded to the board via a Micro-USB cable, open the **Serial Monitor (115200 Baud)** to view calibration logs, dynamic IP assignments, and live database sync operations!
