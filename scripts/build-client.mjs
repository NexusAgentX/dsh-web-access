import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  outfile: 'dist/client.js',
  jsx: 'automatic',
  logLevel: 'info',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-ui-slots',
  ],
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "dsh-web-access", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  },
  footer: {
    js: 'return module.exports; } });',
  },
})
