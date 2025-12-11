import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { NoLongerEvilThermostatPlatform } from './platform';
import { DeviceConfig, ThermostatState } from './types';

export class ThermostatAccessory {
  private service: Service;
  private fanService: Service;
  private occupancyService: Service;
  private state: ThermostatState;
  private occupancyDetected = true; // Default to home (not away)

  private deviceConfig: DeviceConfig;

  constructor(
    private readonly platform: NoLongerEvilThermostatPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.deviceConfig = accessory.context.device as DeviceConfig;

    // Initialize state after platform is available
    this.state = {
      currentTemperature: 20,
      targetTemperature: 20,
      currentHeatingCoolingState: this.platform.Characteristic.CurrentHeatingCoolingState.OFF,
      targetHeatingCoolingState: this.platform.Characteristic.TargetHeatingCoolingState.OFF,
      fanActive: false,
      mode: 'off',
    };

    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Google Nest')
      .setCharacteristic(this.platform.Characteristic.Model, 'Nest Thermostat')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.deviceConfig.serial);

    // Get or create thermostat service
    this.service = this.accessory.getService(this.platform.Service.Thermostat)
      || this.accessory.addService(this.platform.Service.Thermostat);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.deviceConfig.name);

    // Configure temperature display units
    const displayUnits = this.deviceConfig.temperatureDisplayUnits === 'FAHRENHEIT'
      ? this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT
      : this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;

    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .updateValue(displayUnits);

    // Current Temperature (read-only)
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    // Target Temperature
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.handleTargetTemperatureGet.bind(this))
      .onSet(this.handleTargetTemperatureSet.bind(this));

    // Current Heating/Cooling State (read-only)
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.handleCurrentHeatingCoolingStateGet.bind(this));

    // Target Heating/Cooling State
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.handleTargetHeatingCoolingStateGet.bind(this))
      .onSet(this.handleTargetHeatingCoolingStateSet.bind(this));

    // Cooling Threshold Temperature (for AUTO mode)
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onGet(this.handleCoolingThresholdTemperatureGet.bind(this))
      .onSet(this.handleCoolingThresholdTemperatureSet.bind(this));

    // Heating Threshold Temperature (for AUTO mode)
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onGet(this.handleHeatingThresholdTemperatureGet.bind(this))
      .onSet(this.handleHeatingThresholdTemperatureSet.bind(this));

    // Get or create fan service
    this.fanService = this.accessory.getService(this.platform.Service.Fanv2)
      || this.accessory.addService(this.platform.Service.Fanv2, `${this.deviceConfig.name} Fan`, 'fan');

    this.fanService.setCharacteristic(this.platform.Characteristic.Name, `${this.deviceConfig.name} Fan`);

    // Fan Active state
    this.fanService.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.handleFanActiveGet.bind(this))
      .onSet(this.handleFanActiveSet.bind(this));

    // Get or create occupancy sensor service
    this.occupancyService = this.accessory.getService(this.platform.Service.OccupancySensor)
      || this.accessory.addService(this.platform.Service.OccupancySensor, `${this.deviceConfig.name} Occupancy`, 'occupancy');

    this.occupancyService.setCharacteristic(this.platform.Characteristic.Name, `${this.deviceConfig.name} Occupancy`);

    // Occupancy Detected state (read-only)
    this.occupancyService.getCharacteristic(this.platform.Characteristic.OccupancyDetected)
      .onGet(this.handleOccupancyDetectedGet.bind(this));
  }

  // Current Temperature Handlers
  handleCurrentTemperatureGet(): CharacteristicValue {
    return this.state.currentTemperature ?? 20;
  }

  updateCurrentTemperature(value: number) {
    this.state.currentTemperature = value;
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, value);
    this.platform.log.debug(`Updated current temperature for ${this.deviceConfig.serial}: ${value}°C`);

    // Update current heating/cooling state based on temperature differential
    this.updateCurrentHeatingCoolingState();
  }

  // Target Temperature Handlers
  handleTargetTemperatureGet(): CharacteristicValue {
    return this.state.targetTemperature ?? 20;
  }

  async handleTargetTemperatureSet(value: CharacteristicValue) {
    const temp = value as number;
    this.state.targetTemperature = temp;

    // Publish to MQTT
    this.platform.publishCommand(
      this.deviceConfig.serial,
      'shared',
      'target_temperature',
      temp,
    );

    this.platform.log.debug(`Set target temperature for ${this.deviceConfig.serial}: ${temp}°C`);
  }

  updateTargetTemperature(value: number) {
    this.state.targetTemperature = value;
    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, value);
    this.platform.log.debug(`Updated target temperature for ${this.deviceConfig.serial}: ${value}°C`);
  }

  // Cooling Threshold Temperature Handlers (for AUTO mode)
  handleCoolingThresholdTemperatureGet(): CharacteristicValue {
    return this.state.targetTemperatureHigh ?? 24;
  }

  async handleCoolingThresholdTemperatureSet(value: CharacteristicValue) {
    const temp = value as number;
    this.state.targetTemperatureHigh = temp;

    // Publish to MQTT
    this.platform.publishCommand(
      this.deviceConfig.serial,
      'shared',
      'target_temperature_high',
      temp,
    );

    this.platform.log.debug(`Set target temperature high for ${this.deviceConfig.serial}: ${temp}°C`);
  }

  updateTargetTemperatureHigh(value: number) {
    this.state.targetTemperatureHigh = value;
    this.service.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, value);
    this.platform.log.debug(`Updated target temperature high for ${this.deviceConfig.serial}: ${value}°C`);
  }

  // Heating Threshold Temperature Handlers (for AUTO mode)
  handleHeatingThresholdTemperatureGet(): CharacteristicValue {
    return this.state.targetTemperatureLow ?? 18;
  }

  async handleHeatingThresholdTemperatureSet(value: CharacteristicValue) {
    const temp = value as number;
    this.state.targetTemperatureLow = temp;

    // Publish to MQTT
    this.platform.publishCommand(
      this.deviceConfig.serial,
      'shared',
      'target_temperature_low',
      temp,
    );

    this.platform.log.debug(`Set target temperature low for ${this.deviceConfig.serial}: ${temp}°C`);
  }

  updateTargetTemperatureLow(value: number) {
    this.state.targetTemperatureLow = value;
    this.service.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, value);
    this.platform.log.debug(`Updated target temperature low for ${this.deviceConfig.serial}: ${value}°C`);
  }

  // Current Heating/Cooling State Handlers
  handleCurrentHeatingCoolingStateGet(): CharacteristicValue {
    return this.state.currentHeatingCoolingState;
  }

  private updateCurrentHeatingCoolingState() {
    if (this.state.mode === 'off') {
      this.state.currentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    } else if (this.state.currentTemperature !== undefined && this.state.targetTemperature !== undefined) {
      const diff = this.state.targetTemperature - this.state.currentTemperature;
      const threshold = 0.5; // 0.5°C threshold

      if (Math.abs(diff) < threshold) {
        // Within threshold, not actively heating or cooling
        this.state.currentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      } else if (diff > threshold && (this.state.mode === 'heat' || this.state.mode === 'range')) {
        // Current temp is below target, heating
        this.state.currentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      } else if (diff < -threshold && (this.state.mode === 'cool' || this.state.mode === 'range')) {
        // Current temp is above target, cooling
        this.state.currentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
      } else {
        this.state.currentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      }
    }

    this.service.updateCharacteristic(
      this.platform.Characteristic.CurrentHeatingCoolingState,
      this.state.currentHeatingCoolingState,
    );
  }

  // Target Heating/Cooling State Handlers
  handleTargetHeatingCoolingStateGet(): CharacteristicValue {
    return this.state.targetHeatingCoolingState;
  }

  async handleTargetHeatingCoolingStateSet(value: CharacteristicValue) {
    const state = value as number;
    this.state.targetHeatingCoolingState = state;

    // Map HomeKit state to Nest mode
    let nestMode: string;
    switch (state) {
      case this.platform.Characteristic.TargetHeatingCoolingState.OFF:
        nestMode = 'off';
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
        nestMode = 'heat';
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
        nestMode = 'cool';
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
        nestMode = 'range';
        break;
      default:
        nestMode = 'off';
    }

    this.state.mode = nestMode;

    // Publish to MQTT
    this.platform.publishCommand(
      this.deviceConfig.serial,
      'shared',
      'target_temperature_type',
      nestMode,
    );

    this.platform.log.debug(`Set mode for ${this.deviceConfig.serial}: ${nestMode}`);

    // Update current heating/cooling state
    this.updateCurrentHeatingCoolingState();
  }

  updateMode(mode: string) {
    this.state.mode = mode;

    // Map Nest mode to HomeKit state
    let homekitState: number;
    switch (mode) {
      case 'off':
        homekitState = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
        break;
      case 'heat':
        homekitState = this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
        break;
      case 'cool':
        homekitState = this.platform.Characteristic.TargetHeatingCoolingState.COOL;
        break;
      case 'range':
        homekitState = this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
        break;
      default:
        homekitState = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }

    this.state.targetHeatingCoolingState = homekitState;
    this.service.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, homekitState);
    this.platform.log.debug(`Updated mode for ${this.deviceConfig.serial}: ${mode}`);

    // Update current heating/cooling state
    this.updateCurrentHeatingCoolingState();
  }

  // Fan Handlers
  handleFanActiveGet(): CharacteristicValue {
    return this.state.fanActive
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
  }

  async handleFanActiveSet(value: CharacteristicValue) {
    const active = value === this.platform.Characteristic.Active.ACTIVE;
    this.state.fanActive = active;

    // Publish to MQTT
    this.platform.publishCommand(
      this.deviceConfig.serial,
      'device',
      'fan_timer_active',
      active,
    );

    this.platform.log.debug(`Set fan active for ${this.deviceConfig.serial}: ${active}`);
  }

  updateFanState(active: boolean) {
    this.state.fanActive = active;
    const homekitState = active
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;

    this.fanService.updateCharacteristic(this.platform.Characteristic.Active, homekitState);
    this.platform.log.debug(`Updated fan state for ${this.deviceConfig.serial}: ${active}`);
  }

  // Occupancy Handlers
  handleOccupancyDetectedGet(): CharacteristicValue {
    return this.occupancyDetected
      ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
      : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
  }

  updateOccupancy(occupied: boolean) {
    this.occupancyDetected = occupied;
    const homekitState = occupied
      ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
      : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;

    this.occupancyService.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, homekitState);
    this.platform.log.debug(`Updated occupancy for ${this.deviceConfig.serial}: ${occupied ? 'home' : 'away'}`);
  }
}
