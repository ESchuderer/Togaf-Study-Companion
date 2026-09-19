import {defineConfig} from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output:'static',
  base:process.env.ASTRO_BASE || '/',
  build:{format:'directory'},
  trailingSlash:'always',
  integrations:[react()],
  vite:{plugins:[tailwindcss()]}
});
