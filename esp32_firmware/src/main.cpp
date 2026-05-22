#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>

#include "dashboard.h" // Local offline captive portal UI

// ==========================================
// PIN CONFIGURATIONS & MAPPINGS
// ==========================================
// Seismic Monitoring (I2C)
#define I2C_SDA 21 // Connect MPU6050 SDA here
#define I2C_SCL 22 // Connect MPU6050 SCL here

// Location Tracking (UART2)
#define GPS_RX 16 // Connect NEO-6M TX here
#define GPS_TX 17 // Connect NEO-6M RX here

// Analog Sensors (ADC1)
#define PIN_RAIN 34 // Connect Raindrop Analog Out here
#define PIN_SOIL 35 // Connect Soil Moisture Analog Out here

// Water Level (Ultrasonic JSN-SR04T)
#define PIN_TRIG 12 // Connect Ultrasonic Trigger here
#define PIN_ECHO 13 // Connect Ultrasonic Echo here

// ==========================================
// GLOBAL OBJECTS
// ==========================================
WebServer server(80);
DNSServer dnsServer;
Adafruit_MPU6050 mpu;
TinyGPSPlus gps;
HardwareSerial SerialGPS(2);

// Task handle for FreeRTOS sensors loop
TaskHandle_t SensorTask;

// ==========================================
// TELEMETRY VARIABLES
// ==========================================
float seismicForceG = 0.0;
float rainPercent = 0.0;
float soilPercent = 0.0;
float waterLevelCm = 0.0;
String gpsLat = "";
String gpsLng = "";
bool highRisk = false;

// ==========================================
// HELPER FUNCTIONS
// ==========================================
float measureWaterDistance() {
    // Non-blocking pulse mechanism inside the dedicated RTOS task
    digitalWrite(PIN_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(PIN_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(PIN_TRIG, LOW);
    
    // 30ms timeout prevents excessive stalling if signal is lost
    long duration = pulseIn(PIN_ECHO, HIGH, 30000); 
    if(duration == 0) return -1.0;
    return (duration * 0.0343) / 2.0;
}

// ==========================================
// SENSOR RTOS TASK (Runs on Core 0)
// ==========================================
// This completely separates slow sensor polling from the WebServer handling
void sensorLoop(void * parameter) {
    for(;;) {
        // 1. Process GPS Data
        while (SerialGPS.available() > 0) {
            gps.encode(SerialGPS.read());
        }
        
        // 10-second indoor fallback logic
        if (gps.location.isValid() && gps.location.isUpdated()) {
            gpsLat = String(gps.location.lat(), 6);
            gpsLng = String(gps.location.lng(), 6);
        } else if (millis() > 10000) {
            if (gpsLat == "") {
                gpsLat = "Testing Site Location";
                gpsLng = "(Indoor Fallback Lock)";
            }
        }
        
        // 2. Process Seismic (MPU6050)
        sensors_event_t a, g, temp;
        mpu.getEvent(&a, &g, &temp);
        // Calculate net magnitude vector and remove the standard 1G of Earth's resting gravity
        float netG = sqrt(pow(a.acceleration.x, 2) + pow(a.acceleration.y, 2) + pow(a.acceleration.z, 2)) / 9.81;
        seismicForceG = abs(netG - 1.0); 
        
        // 3. Process Analog (Rain & Soil)
        int rawRain = analogRead(PIN_RAIN);
        int rawSoil = analogRead(PIN_SOIL);
        
        // Map 12-bit ADC (0-4095) to 0-100% saturation metrics
        // Typically, lower ADC means wetter for these modules
        rainPercent = map(rawRain, 4095, 0, 0, 100);
        soilPercent = map(rawSoil, 4095, 0, 0, 100);
        
        // Constrain mapping boundaries
        if (rainPercent < 0) rainPercent = 0; if (rainPercent > 100) rainPercent = 100;
        if (soilPercent < 0) soilPercent = 0; if (soilPercent > 100) soilPercent = 100;
        
        // 4. Process Water Level (Ultrasonic)
        float dist = measureWaterDistance();
        if(dist > 0) {
            waterLevelCm = dist;
        }
        
        // 5. Risk Assessment Engine (Sensor Fusion)
        // High Risk = (Soil > 85% AND Rain > 50%) OR (Seismic Force > 0.5G) OR (Water level falls below 50cm from sensor)
        if ((soilPercent > 85.0 && rainPercent > 50.0) || 
            (seismicForceG > 0.5) || 
            (waterLevelCm > 0 && waterLevelCm < 50.0)) {
            highRisk = true;
        } else {
            highRisk = false;
        }
        
        // 100ms non-blocking polling delay for the FreeRTOS scheduler
        vTaskDelay(100 / portTICK_PERIOD_MS); 
    }
}

// ==========================================
// SETUP ROUTINE
// ==========================================
void setup() {
    Serial.begin(115200);
    
    // Pin Modes
    pinMode(PIN_TRIG, OUTPUT);
    pinMode(PIN_ECHO, INPUT);
    
    // Initialize I2C and MPU6050
    Wire.begin(I2C_SDA, I2C_SCL);
    if (!mpu.begin()) {
        Serial.println("Failed to find MPU6050 chip");
    }
    
    // Initialize UART2 for GPS
    SerialGPS.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
    
    // --- Layer 1: Air-Gapped Network & Captive Portal ---
    WiFi.mode(WIFI_AP);
    // Set static gateway to 192.168.4.1
    WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
    WiFi.softAP("EMERGENCY_RESCUE_NODE"); // Open network (No password)
    
    Serial.println("Captive Portal AP Started: EMERGENCY_RESCUE_NODE");
    
    // Start DNS Server on Port 53 to hijack all requests to the ESP32 IP
    dnsServer.start(53, "*", IPAddress(192, 168, 4, 1));
    
    // --- Serve Web UI ---
    server.on("/", HTTP_GET, []() {
        server.send(200, "text/html", html_page);
    });
    
    // --- Serve Live JSON Telemetry ---
    server.on("/data", HTTP_GET, []() {
        String json = "{";
        json += "\"rain\":" + String(rainPercent) + ",";
        json += "\"soil\":" + String(soilPercent) + ",";
        json += "\"seismic\":" + String(seismicForceG) + ",";
        json += "\"water\":" + String(waterLevelCm) + ",";
        json += "\"lat\":\"" + gpsLat + "\",";
        json += "\"lng\":\"" + gpsLng + "\",";
        json += "\"risk\":" + String(highRisk ? "true" : "false");
        json += "}";
        server.send(200, "application/json", json);
    });
    
    // Captive Portal Catch-All Redirect (Redirects OS sign-in checks)
    server.onNotFound([]() {
        server.sendHeader("Location", "http://192.168.4.1/", true);
        server.send(302, "text/plain", "");
    });
    
    server.begin();
    
    // Launch FreeRTOS Sensor Task pinned to Core 0 (WiFi runs on Core 1 by default)
    xTaskCreatePinnedToCore(
        sensorLoop,     // Function to implement the task
        "SensorTask",   // Name of the task
        4096,           // Stack size in words
        NULL,           // Task input parameter
        1,              // Priority of the task
        &SensorTask,    // Task handle
        0               // Core where the task should run
    );
}

// ==========================================
// MAIN LOOP (Runs on Core 1)
// ==========================================
void loop() {
    // Both of these are non-blocking and process instantly
    dnsServer.processNextRequest();
    server.handleClient();
}
