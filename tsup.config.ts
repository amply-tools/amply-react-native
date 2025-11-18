import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'plugin/index': 'plugin/index.ts',
  },
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  external: ['react-native', 'react', '@expo/config-plugins'],
});
