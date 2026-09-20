import {defineConfig} from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output:'static',
  outDir:process.env.TOGAF_DEPLOYMENT==='cloud'?'./dist-cloud':'./dist',
  base:process.env.ASTRO_BASE || '/',
  build:{format:'directory'},
  trailingSlash:'always',
  integrations:[react()],
  vite:{plugins:[tailwindcss()]}
});
