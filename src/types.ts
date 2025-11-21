export interface PlatformConfig {
  name: string;
  mqttBroker: string;
  mqttUsername?: string;
  mqttPassword?: string;
  mqttClientId?: string;
  topicPrefix?: string;
  devices: DeviceConfig[];
}

export interface DeviceConfig {
  name: string;
  serial: string;
  temperatureDisplayUnits?: 'CELSIUS' | 'FAHRENHEIT';
}

export interface ThermostatState {
  currentTemperature?: number;
  targetTemperature?: number;
  targetTemperatureLow?: number;
  targetTemperatureHigh?: number;
  currentHeatingCoolingState: number;
  targetHeatingCoolingState: number;
  fanActive: boolean;
  mode: string; // 'off' | 'heat' | 'cool' | 'range'
}
