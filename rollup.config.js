import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
// import { terser } from 'rollup-plugin-terser';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('./package.json');

const globals = {
  ...packageJson.devDependencies,
};

export default {
  input: 'src/index.ts',
  plugins: [
    json(),
    commonjs(),
    nodeResolve({
      browser: true,
      extensions: ['.js', '.ts'],
      preferBuiltins: true,
    }),
    typescript({
      tsconfig: './tsconfig.json',
      moduleResolution: 'node',
      outDir: 'types',
      target: 'es2019',
      outputToFilesystem: false,
    }),
    replace({
      preventAssignment: true,
      values: {},
    }),
    // terser(),
  ],
  external: [...Object.keys(globals), 'bluebird', 'readable-stream'],
  output: {
    file: 'dist/browser/index.js',
    format: 'es',
    sourcemap: true,
  },
};
