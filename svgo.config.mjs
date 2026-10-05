// svgo.config.mjs
// `npm run svgo` rewrites the SVGs in src/assets in place. Run it after
// adding or replacing an SVG, check the pages, then commit the result.

export default {
  multipass: true,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          // IDs are referenced from outside each file: sprite symbols through
          // <use href="file.svg#id">, diagram blocks by DiagramViewer, and the
          // nf- and s404- prefixes keep the two inline 404 SVGs from clashing.
          cleanupIds: false,
          // Sprite <symbol>s are only drawn where a page references them.
          removeHiddenElems: false,
        },
      },
    },
  ],
};
