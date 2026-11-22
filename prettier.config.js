export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'none',
  printWidth: 100,
  // `auto` keeps each file's line endings: the Windows working tree is CRLF.
  endOfLine: 'auto',
  plugins: ['prettier-plugin-tailwindcss'],
  // Tailwind 4 has no config file; the plugin sorts against the stylesheet with @theme.
  tailwindStylesheet: './src/styles/main.css'
}
