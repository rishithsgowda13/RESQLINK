#include <WiFi.h>
#include <WebServer.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <UniversalTelegramBot.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include <TinyGPS++.h>

// ================== Pin Definitions ==================
#define DHTPIN 14           // Recommended Pin 14 to avoid boot loops
#define DHTTYPE DHT11
#define WATERLEVEL_PIN 34
#define SOIL_MOISTURE_PIN 35
#define MQ_PIN 32           // Air Quality Sensor
#define RAIN_PIN 33         // Rain Sensor

// New Sensors: NEO-6M GPS & Storm Sensors
#define GPS_RX_PIN 16       // Hardware Serial RX2
#define GPS_TX_PIN 17       // Hardware Serial TX2
#define WIND_SPEED_PIN 36   // Analog Input (ADC1_CH0 / VP) for wind speed
#define WIND_DIR_PIN 39     // Analog Input (ADC1_CH3 / VN) for wind direction

// ================== Credentials ==================
const char* ssid = "Realme15pro";         
const char* password = "Rishith2007"; 
const char* botToken = "8683344314:AAETE34zer-DgxDcDqa56Vi_sJ8MQeCSRQc";
const char* chatID = "7988893018";

const char* supabase_url = "https://roypndzefjunimxzvcnf.supabase.co/rest/v1/sensor_logs";
const char* supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJveXBuZHplZmp1bmlteHp2Y25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMTgwNTMsImV4cCI6MjA5Mzc5NDA1M30.bxHGO-nOBEsTBDUg8WIVHRr3Qyxy0g1DxokvVOHqK18";

// ================== Logic Variables ==================
float prevTemp = 0, prevHum = 0, prevWater = 0, prevSeismic = 0, prevAir = 0, prevRain = 0;
int prevSoil = 0;

// New Logic Variables for Storm/GPS Sensors
float prevPressure = 0, prevAltitude = 0, prevWindSpeed = 0, prevWindDir = 0;
double prevLat = 0, prevLng = 0;

int sameDataCount = 0;
int fetchCount = 0;
unsigned long currentInterval = 5000; 
unsigned long lastCheck = 0;

const float T_TOL = 0.5;   
const int S_TOL = 100;     
const float W_TOL = 50.0;  
const float V_TOL = 0.5;    // Vibration tolerance
const float A_TOL = 50.0;   // Air quality tolerance
const float R_TOL = 100.0;  // Rain tolerance

// New Tolerance Bounds
const float P_TOL = 2.0;    // Pressure tolerance (hPa)
const float WIND_TOL = 5.0; // Wind speed tolerance (km/h)

DHT dht(DHTPIN, DHTTYPE);
Adafruit_MPU6050 mpu;
Adafruit_BMP280 bmp;        // BMP280 connected via I2C (SDA/SCL)
TinyGPSPlus gps;

WiFiClientSecure client;
UniversalTelegramBot bot(botToken, client);

void pushToSupabase(float t, float h, int s, float w, float v, float a, float r, 
                    float pressure, float altitude, float wind_speed, float wind_dir,
                    double latitude, double longitude, String status) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(" [!] Failed to Sync: WiFi Disconnected");
    return;
  }
  
  HTTPClient http;
  http.begin(supabase_url);
  http.addHeader("apikey", supabase_key);
  http.addHeader("Authorization", "Bearer " + String(supabase_key));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  StaticJsonDocument<512> doc;
  doc["temperature"] = t;
  doc["humidity"] = h;
  doc["soil_moisture"] = s;
  doc["water_level"] = w;
  doc["seismic"] = v;
  doc["air_quality"] = a;
  doc["rain_level"] = r;
  
  // New metrics injected
  doc["baro_pressure"] = pressure;
  doc["altitude"] = altitude;
  doc["wind_speed"] = wind_speed;
  doc["wind_direction"] = wind_dir;
  doc["latitude"] = latitude;
  doc["longitude"] = longitude;
  doc["status"] = status;

  String json;
  serializeJson(doc, json);
  
  Serial.println(" [>] Uploading payload to Supabase...");
  int response = http.POST(json);
  
  if (response > 0) {
    Serial.printf(" [✔] Supabase Success (Code: %d)\n", response);
  } else {
    Serial.printf(" [✘] Supabase Error: %s\n", http.errorToString(response).c_str());
  }
  http.end();
}

void handleNewMessages(int numNewMessages) {
  for (int i = 0; i < numNewMessages; i++) {
    String chat_id = String(bot.messages[i].chat_id);
    String text = bot.messages[i].text;

    if (text == "/start") {
      String welcome = "Welcome to ResqLink Bot!\n";
      welcome += "Use /status to get live sensor data.\n";
      welcome += "Use /help for more commands.";
      bot.sendMessage(chat_id, welcome, "");
    }

    if (text == "/status") {
      float h = dht.readHumidity();
      float t = dht.readTemperature();
      int s = analogRead(SOIL_MOISTURE_PIN);
      float w = analogRead(WATERLEVEL_PIN);
      float a = analogRead(MQ_PIN);
      float r = 4095 - analogRead(RAIN_PIN);
      
      // BMP280 reading
      float pressureVal = 1013.25;
      float altVal = 0.0;
      if (bmp.begin()) {
        pressureVal = bmp.readPressure() / 100.0F;
        altVal = bmp.readAltitude(1013.25);
      }
      
      // Wind speed/direction analog reading
      float windSpeedVal = analogRead(WIND_SPEED_PIN) * (120.0 / 4095.0);
      float windDirVal = analogRead(WIND_DIR_PIN) * (360.0 / 4095.0);

      String status = "📊 *Live Status Report*\n";
      status += "🌡 Temp: " + String(t) + "°C\n";
      status += "💧 Hum: " + String(h) + "%\n";
      status += "🌱 Soil: " + String(s) + "\n";
      status += "🌊 Water: " + String(w) + "\n";
      status += "💨 Air Quality: " + String(a) + "\n";
      status += "🌧 Rain: " + String(r) + "\n";
      status += "🎈 Pressure: " + String(pressureVal) + " hPa\n";
      status += "🏔 Altitude: " + String(altVal) + " m\n";
      status += "💨 Wind Speed: " + String(windSpeedVal) + " km/h\n";
      status += "🧭 Wind Angle: " + String(windDirVal) + "°\n";
      
      bot.sendMessage(chat_id, status, "Markdown");
    }

    if (text == "/help") {
      String help = "ResqLink Bot Commands:\n";
      help += "/status - Get current sensor readings\n";
      help += "/start - Reset and show welcome message";
      bot.sendMessage(chat_id, help, "");
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN); // NEO-6M Serial Baud rate is 9600
  delay(1000);
  Serial.println("\n\n====================================");
  Serial.println("   RESQLINK DISASTER MONITOR V3   ");
  Serial.println("====================================");
  
  dht.begin();
  
  if (!mpu.begin()) {
    Serial.println(" [!] MPU6050 NOT FOUND - Check Wiring!");
  } else {
    Serial.println(" [✔] MPU6050 Initialized!");
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  }

  if (!bmp.begin(0x76)) { // standard I2C address for BMP280 modules
    Serial.println(" [!] BMP280 NOT FOUND - Check Wiring / I2C Address!");
  } else {
    Serial.println(" [✔] BMP280 Initialized!");
  }

  client.setInsecure();
  
  Serial.printf("Connecting to: %s ", ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\n [✔] WiFi Connected!");
  Serial.println(" [i] IP Address: " + WiFi.localIP().toString());
  Serial.println(" [i] Device MAC: " + WiFi.macAddress());
  Serial.println("------------------------------------");
}

void loop() {
  // Feed the GPS parser
  while (Serial2.available() > 0) {
    gps.encode(Serial2.read());
  }

  if (millis() - lastCheck > currentInterval) {
    lastCheck = millis();
    fetchCount++;

    float h = dht.readHumidity();
    float t = dht.readTemperature();
    int s = analogRead(SOIL_MOISTURE_PIN);
    float w = analogRead(WATERLEVEL_PIN);
    float a_val = analogRead(MQ_PIN);
    float r_val = 4095 - analogRead(RAIN_PIN); // Invert because rain sensors usually output low when wet

    // Read MPU6050 Seismic Data
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    float v = sqrt(sq(a.acceleration.x) + sq(a.acceleration.y) + sq(a.acceleration.z)); // Total magnitude

    // Read BMP280 Storm parameters
    float pressureVal = 1013.25;
    float altVal = 0.0;
    if (bmp.begin(0x76)) {
      pressureVal = bmp.readPressure() / 100.0F; // Convert Pa to hPa
      altVal = bmp.readAltitude(1013.25);
    } else {
      // Mock stable value with slight deviation for prototyping
      pressureVal = 1013.25 + ((float)(rand() % 10 - 5) / 10.0F);
      altVal = 760.0 + ((float)(rand() % 20 - 10) / 10.0F);
    }

    // Read Wind Speed & Wind Direction
    float windSpeedVal = analogRead(WIND_SPEED_PIN) * (120.0 / 4095.0); // Map to 0-120 km/h
    float windDirVal = analogRead(WIND_DIR_PIN) * (360.0 / 4095.0);    // Map to 0-360 degrees

    // Read GPS location
    double latVal = 12.3168; // Default to command base coordinates (Mysuru)
    double lngVal = 76.6135;
    if (gps.location.isValid()) {
      latVal = gps.location.lat();
      lngVal = gps.location.lng();
    } else {
      // Prototyping drift simulation
      latVal += ((float)(rand() % 100 - 50) / 100000.0);
      lngVal += ((float)(rand() % 100 - 50) / 100000.0);
    }

    bool majorChange = (abs(t - prevTemp) > T_TOL) || 
                       (abs(s - prevSoil) > S_TOL) || 
                       (abs(w - prevWater) > W_TOL) ||
                       (abs(v - prevSeismic) > V_TOL) ||
                       (abs(a_val - prevAir) > A_TOL) ||
                       (abs(r_val - prevRain) > R_TOL) ||
                       (abs(pressureVal - prevPressure) > P_TOL) ||
                       (abs(windSpeedVal - prevWindSpeed) > WIND_TOL);

    // --- ENHANCED SERIAL MONITORING OUTPUT ---
    Serial.println("\n--- [ FETCH SEQUENCE #" + String(fetchCount) + " ] ---");
    Serial.printf(" TIME: %lu ms | INTERVAL: %lus\n", millis(), currentInterval / 1000);
    Serial.println("------------------------------------");
    
    if (isnan(t) || isnan(h)) {
      Serial.println(" [!] SENSOR ERROR: Check DHT11 Wiring!");
    } else {
      Serial.printf(" TEMP: %.1f °C | HUM: %.1f %%\n", t, h);
    }
    
    Serial.printf(" SOIL: %d | WATER: %.1f\n", s, w);
    Serial.printf(" AIR: %.1f | RAIN: %.1f\n", a_val, r_val);
    Serial.printf(" SEISMIC: %.2f m/s²\n", v);
    Serial.printf(" BAROMETRIC: %.1f hPa | ALTITUDE: %.1f m\n", pressureVal, altVal);
    Serial.printf(" WIND SPEED: %.1f km/h | DIRECTION: %.1f°\n", windSpeedVal, windDirVal);
    Serial.printf(" GPS FIX: %s | LAT: %.6f | LNG: %.6f\n", gps.location.isValid() ? "YES" : "SIMULATED", latVal, lngVal);
    Serial.printf(" SIGNAL: %ld dBm\n", WiFi.RSSI());

    if (!majorChange) {
      sameDataCount++;
      Serial.println(" STATUS: [ SAME DATA ] - Sync Skipped");
      
      if (sameDataCount >= 3 && sameDataCount < 6) {
        currentInterval = 10000;
        Serial.println(" > Throttling Interval to 10s...");
      } else if (sameDataCount >= 6) {
        currentInterval = 30000;
        Serial.println(" > Entering IDLE MODE (30s)...");
      }
    } else {
      Serial.println(" STATUS: [ MAJOR CHANGE DETECTED ]");
      sameDataCount = 0;
      currentInterval = 5000; 
      
      prevTemp = t; prevHum = h; prevSoil = s; prevWater = w; prevSeismic = v; prevAir = a_val; prevRain = r_val;
      prevPressure = pressureVal; prevAltitude = altVal; prevWindSpeed = windSpeedVal; prevWindDir = windDirVal;
      prevLat = latVal; prevLng = lngVal;

      String status = "Updated";
      if (a_val > 1500) status = "Smoke/Gas Alert";
      else if (v > 15.0) status = "Earthquake Alert";
      else if (r_val > 2500) status = "Heavy Rain Alert";
      else if (w > 2000) status = "Flood Alert";
      else if (windSpeedVal > 60.0) status = "Storm Alert (High Winds)";
      else if (pressureVal < 990.0) status = "Barometric Storm Warning";
      else if (t > 45 && s > 3800) status = "Drought";
      
      pushToSupabase(t, h, s, w, v, a_val, r_val, pressureVal, altVal, windSpeedVal, windDirVal, latVal, lngVal, status);

      if (status != "Updated") {
        Serial.println(" [!] ALARM: Sending Telegram Notification...");
        String msg = "🚨 ResqLink Alert: " + status + " detected at site!\nLocation: Lat " + String(latVal, 5) + ", Lng " + String(lngVal, 5);
        bot.sendMessage(chatID, msg, "");
      }
    }
    Serial.println("====================================");
  }

  // Check for Telegram commands every 1 second
  static unsigned long lastBotCheck = 0;
  if (millis() - lastBotCheck > 1000) {
    int numNewMessages = bot.getUpdates(bot.last_message_received + 1);
    while (numNewMessages) {
      handleNewMessages(numNewMessages);
      numNewMessages = bot.getUpdates(bot.last_message_received + 1);
    }
    lastBotCheck = millis();
  }
}