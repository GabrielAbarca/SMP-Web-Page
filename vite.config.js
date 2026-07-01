import { defineConfig } from "vite";
import { resolve } from "path";
import { readFileSync } from "fs";

// Inline the shared SVG icon sprite into every HTML entry point at build time.
// This replaces the render-blocking Google Material Symbols font: the sprite is
// authored once in src/icons/icons.svg, ships with zero extra network requests,
// and—being in-document—lets every <use> icon inherit color via currentColor.
const inlineSvgSprite = () => {
  const sprite = readFileSync(resolve(__dirname, "src/icons/icons.svg"), "utf8").trim();
  return {
    name: "inline-svg-sprite",
    transformIndexHtml(html) {
      // Inject right after the opening <body> tag (handles `<body id="...">` too).
      return html.replace(/<body[^>]*>/, (m) => `${m}\n    ${sprite}`);
    },
  };
};

export default defineConfig({
  plugins: [inlineSvgSprite()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        login: resolve(__dirname, "login.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
});
