import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig as HomebridgePlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import * as mqtt from 'mqtt';
import { PlatformConfig, DeviceConfig } from './types';
import { ThermostatAccessory } from './thermostatAccessory';

export class NoLongerEvilThermostatPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  private mqttClient: mqtt.MqttClient | null = null;
  private thermostatAccessories: Map<string, ThermostatAccessory> = new Map();
  private config: PlatformConfig;

  constructor(
    public readonly log: Logger,
    config: HomebridgePlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.config = config as unknown as PlatformConfig;

    // Validate configuration
    if (!this.config.mqttBroker) {
      this.log.error('MQTT broker URL is required in configuration');
      return;
    }

    if (!this.config.devices || this.config.devices.length === 0) {
      this.log.error('At least one thermostat device must be configured');
      return;
    }

    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.connectMQTT();
      this.discoverDevices();
    });

    this.api.on('shutdown', () => {
      this.log.debug('Shutting down MQTT connection');
      if (this.mqttClient) {
        this.mqttClient.end();
      }
    });
  }

  private connectMQTT() {
    const options: mqtt.IClientOptions = {
      clientId: this.config.mqttClientId || `homebridge-nolongerevil-${Math.random().toString(16).slice(2, 10)}`,
    };

    if (this.config.mqttUsername) {
      options.username = this.config.mqttUsername;
    }

    if (this.config.mqttPassword) {
      options.password = this.config.mqttPassword;
    }

    this.log.info('Connecting to MQTT broker:', this.config.mqttBroker);
    this.mqttClient = mqtt.connect(this.config.mqttBroker, options);

    this.mqttClient.on('connect', () => {
      this.log.info('Connected to MQTT broker');
      this.subscribeToTopics();
    });

    this.mqttClient.on('error', (error) => {
      this.log.error('MQTT connection error:', error.message);
    });

    this.mqttClient.on('message', (topic: string, payload: Buffer) => {
      this.handleMessage(topic, payload);
    });

    this.mqttClient.on('reconnect', () => {
      this.log.debug('Reconnecting to MQTT broker');
    });

    this.mqttClient.on('close', () => {
      this.log.debug('MQTT connection closed');
    });
  }

  private subscribeToTopics() {
    if (!this.mqttClient) {
      return;
    }

    const topicPrefix = this.config.topicPrefix || 'nolongerevil';

    for (const device of this.config.devices) {
      // Subscribe to all state topics for this device
      // Note: current_temperature can be in either shared or device object
      const topics = [
        `${topicPrefix}/${device.serial}/shared/current_temperature`,
        `${topicPrefix}/${device.serial}/device/current_temperature`,
        `${topicPrefix}/${device.serial}/shared/target_temperature`,
        `${topicPrefix}/${device.serial}/shared/target_temperature_low`,
        `${topicPrefix}/${device.serial}/shared/target_temperature_high`,
        `${topicPrefix}/${device.serial}/shared/target_temperature_type`,
        `${topicPrefix}/${device.serial}/device/fan_timer_active`,
        `${topicPrefix}/${device.serial}/device/away`,
        `${topicPrefix}/${device.serial}/availability`,
      ];

      topics.forEach(topic => {
        this.mqttClient!.subscribe(topic, (err) => {
          if (err) {
            this.log.error(`Failed to subscribe to topic ${topic}:`, err.message);
          } else {
            this.log.debug(`Subscribed to topic: ${topic}`);
          }
        });
      });
    }
  }

  private handleMessage(topic: string, payload: Buffer) {
    const topicPrefix = this.config.topicPrefix || 'nolongerevil';
    const topicParts = topic.split('/');

    // Parse topic: prefix/serial/objectType/field
    if (topicParts.length < 4 || topicParts[0] !== topicPrefix) {
      return;
    }

    const serial = topicParts[1];
    const objectType = topicParts[2]; // 'device' or 'shared'
    const field = topicParts[3];

    const accessory = this.thermostatAccessories.get(serial);
    if (!accessory) {
      return;
    }

    // Parse payload
    let value: string | number | boolean;
    const payloadStr = payload.toString();

    try {
      // Try to parse as JSON first
      value = JSON.parse(payloadStr);
    } catch {
      // Try to parse as number
      const numValue = parseFloat(payloadStr);
      if (!isNaN(numValue)) {
        value = numValue;
      } else {
        value = payloadStr;
      }
    }

    this.log.debug(`Received MQTT message: ${topic} = ${value}`);

    // Update accessory based on field
    // current_temperature can come from either shared or device object
    if (field === 'current_temperature') {
      accessory.updateCurrentTemperature(value as number);
    } else if (objectType === 'shared' && field === 'target_temperature') {
      accessory.updateTargetTemperature(value as number);
    } else if (objectType === 'shared' && field === 'target_temperature_low') {
      accessory.updateTargetTemperatureLow(value as number);
    } else if (objectType === 'shared' && field === 'target_temperature_high') {
      accessory.updateTargetTemperatureHigh(value as number);
    } else if (objectType === 'shared' && field === 'target_temperature_type') {
      accessory.updateMode(value as string);
    } else if (objectType === 'device' && field === 'fan_timer_active') {
      accessory.updateFanState(value as boolean);
    } else if (objectType === 'device' && field === 'away') {
      accessory.updateOccupancy(!(value as boolean));
    } else if (field === 'availability') {
      // Handle availability status
      this.log.debug(`Device ${serial} is ${value}`);
    }
  }

  public publishCommand(serial: string, objectType: string, field: string, value: string | number | boolean) {
    if (!this.mqttClient || !this.mqttClient.connected) {
      this.log.error('MQTT client is not connected');
      return;
    }

    const topicPrefix = this.config.topicPrefix || 'nolongerevil';
    const topic = `${topicPrefix}/${serial}/${objectType}/${field}/set`;
    const payload = typeof value === 'object' ? JSON.stringify(value) : String(value);

    this.log.debug(`Publishing MQTT command: ${topic} = ${payload}`);

    this.mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        this.log.error(`Failed to publish to ${topic}:`, err.message);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    for (const device of this.config.devices) {
      const uuid = this.api.hap.uuid.generate(device.serial);
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // Update existing accessory
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        existingAccessory.context.device = device;
        this.api.updatePlatformAccessories([existingAccessory]);

        const thermostatAccessory = new ThermostatAccessory(this, existingAccessory);
        this.thermostatAccessories.set(device.serial, thermostatAccessory);
      } else {
        // Create new accessory
        this.log.info('Adding new accessory:', device.name);
        const accessory = new this.api.platformAccessory(device.name, uuid);
        accessory.context.device = device;

        const thermostatAccessory = new ThermostatAccessory(this, accessory);
        this.thermostatAccessories.set(device.serial, thermostatAccessory);

        this.api.registerPlatformAccessories('homebridge-nolongerevil-thermostat', 'NoLongerEvilThermostat', [accessory]);
        this.accessories.push(accessory);
      }
    }

    // Remove accessories that are no longer configured
    const configuredSerials = this.config.devices.map(d => d.serial);
    const accessoriesToRemove = this.accessories.filter(accessory => {
      const device = accessory.context.device as DeviceConfig;
      return !configuredSerials.includes(device.serial);
    });

    if (accessoriesToRemove.length > 0) {
      this.log.info('Removing', accessoriesToRemove.length, 'accessories');
      this.api.unregisterPlatformAccessories('homebridge-nolongerevil-thermostat', 'NoLongerEvilThermostat', accessoriesToRemove);
    }
  }
}
