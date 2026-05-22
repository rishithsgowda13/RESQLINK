# 📡 ResQLink System Architecture & Execution Flow Chart

This document outlines the complete hardware-software system architecture and the firmware execution logic for the ResQLink Disaster Telemetry Station.

---

## 1. 🏗️ System Architecture

The ResQLink ecosystem is structured into four main layers: **Hardware**, **Firmware (MCU Software)**, **Cloud/Network**, and **Client/Presentation**.

```mermaid
graph TD
    %% Colors
    classDef hardware fill:#e1f5fe,stroke:#039be5,stroke-width:2px;
    classDef firmware fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    classDef cloud fill:#fff3e0,stroke:#ef6c00,stroke-width:2px;
    classDef client fill:#f3e5f5,stroke:#8e24aa,stroke-width:2px;

    %% Hardware Layer
    subgraph "Hardware Layer"
        Sensors["Sensor Suite<br/>(DHT11, MPU6050, BMP280,<br/>GPS, Water, Soil, MQ-2, Rain,<br/>Anemometer, Wind Vane)"]:::hardware
        ESP32["ESP32 DevKit V1<br/>(Main MCU Node)"]:::hardware
        Power["Power Source<br/>(5V USB / Solar / Battery)"]:::hardware
    end

    %% Software/Firmware Layer
    subgraph "Firmware Layer (Software on ESP32)"
        Libraries["Core Libraries<br/>(Wire, TinyGPS++, HTTPClient,<br/>UniversalTelegramBot, ArduinoJson)"]:::firmware
        Throttling["Adaptive Energy Loop<br/>(5s / 10s / 30s Polling)"]:::firmware
        DecisionEngine["Alert Rule Engine<br/>(Threshold Check)"]:::firmware
    end

    %% Network & Cloud Layer
    subgraph "Network / Cloud Layer"
        WiFiRouter["Wi-Fi Network / Router"]:::cloud
        SupaAPI["Supabase REST API<br/>(PostgreSQL Database)"]:::cloud
        TeleAPI["Telegram Bot API"]:::cloud
    end

    %% Presentation Layer
    subgraph "Client / Presentation Layer"
        AdminPanel["Web Dashboard<br/>(Real-Time Analytics Grid)"]:::client
        CommandMap["Leaflet.js Map<br/>(Live GPS Position Tracker)"]:::client
        TeleApp["Telegram App Client<br/>(SOS Alert Push & /status Queries)"]:::client
    end

    %% Connections
    Power -->|VCC / GND| ESP32
    Sensors <-->|Analog, I2C, Serial, Digital| ESP32
    ESP32 -->|Runs Code| Libraries
    Libraries -->|Manages| Throttling
    Throttling -->|Triggers| DecisionEngine
    ESP32 <-->|SSL Connection| WiFiRouter
    WiFiRouter <-->|HTTPS POST| SupaAPI
    WiFiRouter <-->|HTTPS GET/POST| TeleAPI
    SupaAPI -->|Websockets Sync| AdminPanel
    SupaAPI -->|Coordinates Pinning| CommandMap
    TeleAPI <-->|Message Routing| TeleApp
```

---

## 2. 🔄 Firmware Logic Execution Flow

The flow chart below illustrates the step-by-step firmware loop running inside the ESP32 microcontroller, showing the telemetry acquisition, rule evaluation, adaptive power throttling, and external communications.

### 🖼️ Visual Flow Chart
![Firmware Execution Flow Chart](/Users/bharathkumara/.gemini/antigravity/brain/788bfb35-fca5-45df-8cde-40f4daef0dff/firmware_flow_chart_1779447899596.png)

### 📊 Logic Flow Diagram
```mermaid
flowchart TD
    %% Node styles
    classDef startNode fill:#cfd8dc,stroke:#37474f,stroke-dasharray: 5 5;
    classDef processNode fill:#e1f5fe,stroke:#0288d1;
    classDef decisionNode fill:#fff9c4,stroke:#fbc02d;
    classDef outputNode fill:#ffe0b2,stroke:#f57c00;

    Start(["1. Power On / Reset"]):::startNode --> Init["2. Initialize Hardware:<br/>- Serial Port (115200)<br/>- GPS Serial2 (9600)<br/>- Wire I2C Bus<br/>- Connect to Wi-Fi"]:::processNode
    Init --> BootLog["3. Calibration Complete & Local IP Assigned"]:::processNode
    
    %% Loop Starts Here
    BootLog --> LoopStart{"4. Enter Infinite loop()"}:::decisionNode
    
    %% Telemetry Gathering
    LoopStart --> ReadGPS["5. Parse Incoming GPS Sentences via Serial2"]:::processNode
    ReadGPS --> ReadSensors["6. Query Sensor Readings:<br/>- DHT11 (Temp/Hum)<br/>- BMP280 (Pressure/Altitude)<br/>- Analog (Rain, Water, Soil, MQ, Wind Speed & Direction)<br/>- Calculate MPU6050 Seismic Vector Magnitude 'v'"]:::processNode
    
    %% Decision Engine
    ReadSensors --> CheckChange{"7. Is Change > Tolerance?<br/>(e.g., Temp, Seismic, Pressure)"}:::decisionNode
    
    %% Branch A: Change Detected
    CheckChange -- "Yes (Major Change)" --> ActiveMode["8. Reset Timer to 5s Interval<br/>Reset Idle Cycle Count"]:::processNode
    ActiveMode --> CheckAlert{"9. Does it exceed<br/>Emergency Thresholds?<br/>(e.g. Gas > 1500, Seismic > 15)"}:::decisionNode
    
    CheckAlert -- Yes --> SOS["10. Send Immediate Telegram SOS Message"]:::outputNode
    CheckAlert -- No --> PushSupa["11. POST Sensor Payload to Supabase REST API"]:::outputNode
    SOS --> PushSupa
    PushSupa --> CheckTeleMsg
    
    %% Branch B: No Change
    CheckChange -- "No (No Change)" --> IncrementIdle["12. Increment Same Data Counter"]:::processNode
    IncrementIdle --> CheckCounter{"13. Counter Status?"}:::decisionNode
    CheckCounter -- "3 to 5 Cycles" --> Throttle10["14. Set Loop Interval to 10 seconds"]:::processNode
    CheckCounter -- "6+ Cycles" --> Throttle30["15. Set Loop Interval to 30 seconds (Idle Mode)"]:::processNode
    CheckCounter -- "< 3 Cycles" --> KeepInterval["16. Maintain Current Loop Interval"]:::processNode
    
    Throttle10 --> CheckTeleMsg
    Throttle30 --> CheckTeleMsg
    KeepInterval --> CheckTeleMsg
    
    %% Telegram Messaging Check
    CheckTeleMsg["17. Check if 1 second elapsed since last Telegram scan"]:::processNode
    CheckTeleMsg --> CheckUpdates{"18. Any incoming Telegram messages?"}:::decisionNode
    CheckUpdates -- Yes --> CommandHandler["19. Parse Message:<br/>- /start -> Welcome Msg<br/>- /status -> Format & Send Current Telemetry<br/>- /help -> Command List"]:::outputNode
    CheckUpdates -- No --> DelayInterval["20. Delay for Active/Idle Interval"]:::processNode
    
    CommandHandler --> DelayInterval
    DelayInterval --> LoopStart
```

---

## 3. 📝 Component Matrix Breakdown

| Module | Purpose (System Role) | Software Driver / Library | Data Output Type |
| :--- | :--- | :--- | :--- |
| **ESP32 Core** | central compute, data processing, routing | Arduino ESP32 Board Core | Wi-Fi IP, RSSI signal |
| **DHT11** | local thermal & humidity monitoring | `DHT.h` (Adafruit) | Float (Celsius / %) |
| **MPU6050** | seismic tremor & structural vibration | `Adafruit_MPU6050.h` | 3-axis Accelerometer Vector |
| **BMP280** | micro-climate storm warning, altitude tracker | `Adafruit_BMP280.h` | Float (hPa / Meters) |
| **NEO-6M GPS** | geolocation tracking & command map locking | `TinyGPS++.h` | Double (Latitude / Longitude) |
| **Analog Suite** | flood levels, dry drought, gas leak, rainfall, wind | Standard ADC (`analogRead`) | Integer (0 - 4095 ADC) |
| **UniversalTelegramBot** | alert routing, query responder | `UniversalTelegramBot.h` | Secure JSON messages |
| **HTTPClient** | remote database sync | `HTTPClient.h` | HTTPS POST requests |
