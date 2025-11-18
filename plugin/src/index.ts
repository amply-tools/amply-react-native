import type {ConfigPlugin} from '@expo/config-plugins';
import withAmply from './withAmply';

const plugin: ConfigPlugin<{ sdkVersion?: string }> = (config, props) =>
  withAmply(config, props);

export default plugin;
