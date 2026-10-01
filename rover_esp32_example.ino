/*
  ESP32 Rover Client Example (Arduino C++)
  For microcontrollers (ESP32) mounted on the Reach Stacker / Rover vehicle with Wi-Fi.
*/

#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Base Station Laptop IP
const char* serverUrl = "http://192.168.1.100:8000/api/rover/telemetry";

// Hardware Serial2 pins connected to Rover u-blox GNSS chip
#define RXD2 16
#define TXD2 17

void setup() {
  Serial.begin(115200);
  Serial2.begin(115200, SERIAL_8N1, RXD2, TXD2); // GNSS serial

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
}

void loop() {
  // Read GNSS data from Serial2, parse coordinates, and send to Base Station:
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    // Replace with real parsed coordinates from Serial2
    String jsonPayload = "{\"device_id\":\"ROVER-RS-01\",\"latitude\":18.903930,\"longitude\":73.046820,\"altitude\":14.2,\"speed_kmh\":10.0,\"battery_percent\":90}";
    
    int httpResponseCode = http.POST(jsonPayload);
    http.end();
  }
  delay(200); // 5 Hz update rate
}
