import { API } from 'homebridge';
import { NoLongerEvilThermostatPlatform } from './platform';

export = (api: API) => {
  api.registerPlatform('NoLongerEvilThermostat', NoLongerEvilThermostatPlatform);
};
