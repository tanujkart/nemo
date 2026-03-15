#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

#define ONE_WIRE_BUS 13

// Motor pins
#define IN1 27
#define IN2 33

// Analog pins (adjust if needed)
#define TURBIDITY_PIN 34
#define PH_PIN 35

const char* ssid = "NCSSM-IoT";
const char* password = "this_is_a_secret";

const char* serverName = "http://google.com";

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(115200);
  sensors.begin();

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);

  WiFi.begin(ssid, password);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("Connected to WiFi");
}

void loop() {

  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);

  int turbidity = analogRead(TURBIDITY_PIN);
  int ph = analogRead(PH_PIN);

  Serial.print("Temperature: ");
  Serial.println(tempC);

  Serial.print("Turbidity: ");
  Serial.println(turbidity);

  Serial.print("pH: ");
  Serial.println(ph);
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {

    HTTPClient http;
    http.begin(serverName);
    http.addHeader("Content-Type", "application/json");

    String json = "{";
    json += "\"temperature\":" + String(tempC) + ",";
    json += "\"turbidity\":" + String(turbidity) + ",";
    json += "\"ph\":" + String(ph);
    json += "}";

    int httpResponseCode = http.POST(json);

    Serial.print("HTTP Response: ");
    Serial.println(httpResponseCode);

    http.end();
  }

  // Motor ON
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
  delay(3000);

  // Motor OFF
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  delay(3000);
}