#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

#define ONE_WIRE_BUS 13
#define IN1 27
#define IN2 33

#define TURBIDITY_PIN 34
#define PH_PIN 35

const char* ssid = "NCSSM-IoT";
const char* password = "this_is_a_secret";

const char* serverName = "http://httpbin.org/post";

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// GPS variables
String latitude = "";
String longitude = "";
String gpsTime = "";

void setup() {

  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, 16, 17);  // RX, TX pins for GPS

  sensors.begin();

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);

  WiFi.begin(ssid, password);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nConnected to WiFi");
}

void parseGPS(String line) {

  if (line.startsWith("$GPRMC")) {

    int commaIndex[12];
    int count = 0;

    for (int i = 0; i < line.length(); i++) {
      if (line[i] == ',') {
        commaIndex[count++] = i;
      }
    }

    gpsTime = line.substring(commaIndex[0] + 1, commaIndex[1]);
    latitude = line.substring(commaIndex[2] + 1, commaIndex[3]);
    longitude = line.substring(commaIndex[4] + 1, commaIndex[5]);
  }
}

void loop() {

  while (Serial2.available()) {
    String line = Serial2.readStringUntil('\n');
    parseGPS(line);
  }

  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);

  int turbidity = analogRead(TURBIDITY_PIN);
  int ph = analogRead(PH_PIN);

  Serial.println("---- DATA ----");

  Serial.print("GPS Time: ");
  Serial.println(gpsTime);

  Serial.print("Latitude: ");
  Serial.println(latitude);

  Serial.print("Longitude: ");
  Serial.println(longitude);

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
    json += "\"time\":\"" + gpsTime + "\",";
    json += "\"latitude\":\"" + latitude + "\",";
    json += "\"longitude\":\"" + longitude + "\",";
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