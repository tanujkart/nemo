## Inspiration
To protect ecosystems and our drinking water, water quality monitoring is critical. However, the EPA reports that over 50% of rivers and streams in the United States alone fail to meet modern environmental standards. Part of the issue is limited monitoring. Many lakes and reservoirs are only surveyed by a handful of stationary sensors, leaving large portions of water unaccounted for. When monitoring systems are limited to specific areas, warning signals in other areas are missed entirely.

To truly understand water health, we need dynamic, spatial data from across the entire ecosystem. Not just a single point. That's why we built NEMO.

![NEMO](https://raw.githubusercontent.com/tanujkart/nemo/refs/heads/master/nemo.jpeg)

## What NEMO does
NEMO is an IoT-enabled, fully autonomous submarine that collects environmental data — temperature, turbidity, and pH — and streams it to an interactive web dashboard, located [here](https://nemo-brown.vercel.app/). The dashboard provides a 3D/2D globe visualization with scientific ocean color mapping, float tracking, and click-to-measure capabilities.

![NEMO Dashboard](https://raw.githubusercontent.com/tanujkart/nemo/refs/heads/master/dashboard.png)

## How we built it
At the core of the system is an ESP-32 microcontroller that integrates a temperature sensor, a turbidity sensor, and a pH reader, allowing us to capture key indicators of water health. The breadboard was built with a modular design in mind, with power along one row, allowing us to easily add and remove components.

![Breadboard](https://raw.githubusercontent.com/tanujkart/nemo/refs/heads/master/breadboard.png)

![Breadboard Diagram](https://raw.githubusercontent.com/tanujkart/nemo/refs/heads/master/diagram.png)

The submarine is powered by a motor housed in a 3D-printed, fit-sealed enclosure, with specially-sized holes for our power source, motor and sensors, with tight tolerances for sealing.

![Shell](https://raw.githubusercontent.com/tanujkart/nemo/refs/heads/master/shell.png)

On the submarine itself, we chose to place the turbidity sensor out front, the leash on the top, and the temperature sensor sticking out the bottom to maintain balance in it's upright position. This is so it can efficiently move through the water without tilting or turning unnecessarily.

On the software side, data is continuously collected from each sensor. Sensor readings get packaged into structured data, including location, time, and water quality measurements. All of the data collected by the submarine is streamed to a live monitoring dashboard through our ESP-32’s Wi-fi functionality. Here, researchers can see real-time measurements for key indicators in either 3D or 2D.

```
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
```

## Challenges we ran into
There were some limitations brought on by the short time frame that made us have to rethink some of our components. 

For example, our turbidity sensor outputs a signal up to 4.5V, which is above the Adafruit ESP-32's 3.3V capacity. Thus, we would've had to create a system of resistors and software adjustments to clamp our turbidity readings into our 0-3.3V range and output an accurate NTU reading. However, we soon plan to make a version of NEMO with a fully-functional turbidity sensor.

Similarly, we did not have time to calibrate our pH sensor, but it still correctly sends a reading to our ESP-32. Unfortunately, after calculating the power of the motor and force of the propeller, we had to settle on a smaller design, scrapping the large pH sensor. However, with more efficient packaging, we plan to make a version of NEMO with a fully functioning pH sensor.

## Accomplishments that we're proud of
We are mainly proud of the fact that our members went outside of their comfort zones for this project.

Nate knew nothing about microcontrollers, breadboarding, or sensors before starting this project, but was still able to create a modular breadboard design that easily incorporated all three sensors and the motor, as well as code a way to send these readings to our website.

Trevor also went out of his comfort zone by cadding a fit-sealed body for the submarine, as well as CADding well-placed and correctly-sized holes to fit components in. The body perfectly held all the electronics, and the propeller fit perfectly.

## What we learned
Apart from our individual learning accomplishments as discussed previously, we learned how to function better as a team, scheduling tasks and asking for help from other hackathon members and our technical advisors.

## What's next for NEMO
With more time, we plan to make changes to our turbidity and pH sensors as discussed previously, and make internal holders to keep our electronics safe. Additionally, we will solder parts together to fix the jankiness of a breadboard. Along with that, we will implement fins to steer, a pump to go up and down, and a method to change our pitch.