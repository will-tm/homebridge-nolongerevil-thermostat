# Homebridge No Longer Evil Thermostat

A Homebridge plugin that integrates Google Nest thermostats with Apple HomeKit via MQTT, using the No Longer Evil Thermostat server.

## Features

- Control target temperature via HomeKit
- Switch between heating, cooling, auto, and off modes
- View current temperature readings
- Control fan on/auto modes
- Occupancy/presence detection (home/away status)
- Support for multiple thermostats
- Configurable MQTT broker connection
- Support for both Celsius and Fahrenheit temperature units

## Installation

### Option 1: Install via NPM

```bash
npm install -g homebridge-nolongerevil-thermostat
```

### Option 2: Install from Source

```bash
cd homebridge-plugin
npm install
npm run build
npm link
```

## Configuration

Add the following to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "NoLongerEvilThermostat",
      "name": "No Longer Evil Thermostat",
      "mqttBroker": "mqtt://192.168.1.100:1883",
      "mqttUsername": "your_username",
      "mqttPassword": "your_password",
      "topicPrefix": "nolongerevil",
      "devices": [
        {
          "name": "Living Room Thermostat",
          "serial": "02AA01AC2DD45XEQ",
          "temperatureDisplayUnits": "CELSIUS"
        },
        {
          "name": "Bedroom Thermostat",
          "serial": "02BB02BDC0DEA87E",
          "temperatureDisplayUnits": "FAHRENHEIT"
        }
      ]
    }
  ]
}
```

### Configuration Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `platform` | Yes | - | Must be `NoLongerEvilThermostat` |
| `name` | Yes | - | Platform name for Homebridge |
| `mqttBroker` | Yes | - | MQTT broker URL (e.g., `mqtt://localhost:1883` or `mqtts://broker.example.com:8883`) |
| `mqttUsername` | No | - | MQTT broker username (if required) |
| `mqttPassword` | No | - | MQTT broker password (if required) |
| `topicPrefix` | No | `nolongerevil` | MQTT topic prefix used by your server |
| `devices` | Yes | - | Array of thermostat devices to expose |

### Device Configuration

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `name` | Yes | - | Display name in HomeKit |
| `serial` | Yes | - | 16-character thermostat serial number |
| `temperatureDisplayUnits` | No | `CELSIUS` | Temperature units: `CELSIUS` or `FAHRENHEIT` |

## HomeKit Features

### Thermostat Service

- **Current Temperature** - Displays the current room temperature
- **Target Temperature** - Set the desired temperature
- **Heating/Cooling Mode** - Choose between:
  - Off - HVAC system disabled
  - Heat - Heating mode
  - Cool - Cooling mode
  - Auto - Automatic heating/cooling (range mode)
- **Current State** - Shows if actively heating, cooling, or idle
- **Heating/Cooling Threshold** - Set temperature range for auto mode

### Fan Service

- **Fan Active** - Turn fan on/auto
  - Active - Fan continuously running
  - Inactive - Fan in auto mode

### Occupancy Sensor

- **Occupancy Detected** - Shows home/away status (read-only)
  - Occupancy Detected - Someone is home (away=false)
  - Occupancy Not Detected - Everyone is away (away=true)

## HVAC Mode Mapping

| HomeKit Mode | Nest Mode | Description |
|--------------|-----------|-------------|
| Off | `off` | System off |
| Heat | `heat` | Heating only |
| Cool | `cool` | Cooling only |
| Auto | `range` | Automatic heating/cooling |

## Temperature Units

- All MQTT communication uses Celsius internally
- HomeKit displays temperatures according to the `temperatureDisplayUnits` setting
- The plugin automatically handles conversion between Celsius and Fahrenheit

## Requirements

- Homebridge >= 1.6.0
- Node.js >= 18.0.0
- Running No Longer Evil Thermostat server
- MQTT broker (e.g., Mosquitto)

## Finding Your Thermostat Serial Number

The serial number is an 8-character hexadecimal string that uniquely identifies your Nest thermostat. You can find it:

1. In the No Longer Evil Thermostat web interface
2. On the back of your physical thermostat
3. In your Nest mobile app under device settings

## Troubleshooting

### Plugin Not Connecting to MQTT

- Verify your MQTT broker URL is correct
- Check that your MQTT broker is running and accessible
- Confirm username/password if authentication is required
- Check Homebridge logs for connection errors

### Thermostat Not Appearing in HomeKit

- Verify the serial number is correct
- Check that the No Longer Evil Thermostat server is running
- Ensure the server is publishing to MQTT
- Check MQTT broker logs for incoming messages

### Temperature Not Updating

- Verify MQTT broker is receiving updates from the server
- Check that topic prefix matches your server configuration
- Ensure device serial number is correct

### Commands Not Working

- Verify MQTT broker is receiving published commands
- Check that your user account has access to the device
- Review Homebridge logs for error messages

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Testing Locally

```bash
npm link
```

