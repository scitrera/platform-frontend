// postcss.config.js - Use ES module syntax
import tailwindcss from '@tailwindcss/postcss'; // <-- Use the dedicated PostCSS plugin package
import autoprefixer from 'autoprefixer';
import tailwindConfig from './tailwind.config.js';


export default {
    plugins: [
        tailwindcss(tailwindConfig),
        autoprefixer,
    ],
};