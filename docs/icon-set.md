# DirTree Icon Set

The official extension mark is **Layered Branches**, selected from the image-generated logo concepts. Its folded blue ribbon surrounds a directory hierarchy with a parent node, two nested children, and a separate branch.

## Sources And Exports

- `media/icon.svg` is the editable vector master, reconstructed from the approved concept with clean geometry and transparent negative space.
- `media/icon.png` is the 256 × 256 marketplace and Extensions-view icon referenced by `package.json`.
- `media/dirtree.svg` is the simplified monochrome Activity Bar mark referenced by `contributes.viewsContainers.activitybar`. VS Code uses this SVG as a mask and supplies the theme's foreground color, including high-contrast themes.
- `media/icons/dirtree-{size}.png` provides transparent exports at 16, 24, 32, 48, 64, 128, 256, 512, and 1024 pixels.
- `media/icons/dirtree-light.svg`, `dirtree-dark.svg`, and `dirtree-high-contrast.svg` provide standalone monochrome renditions. The installed Activity Bar uses the theme-tinted mask, rather than these fixed-color exports.
- `media/icons/preview.png` compares the color mark and Activity Bar mark against light and dark backgrounds.

The full-color mark is shared across light and dark surfaces. The runtime package includes the marketplace PNG and theme-aware Activity Bar SVG; the remaining exports and editable master are maintained in the repository.

## Rebuild

Run `npm run build:icon` with the project's Playwright Chromium installed. This renders the SVG master, copies the 256-pixel export to the manifest's official icon path, and regenerates monochrome variants and the preview. Then run `npm run package` to rebuild and verify the VSIX.

## Provenance

The approved image is `output/imagegen/logo-options/06-layered-branches.png`. Its prompt is preserved in `output/imagegen/logo-options/round-2-prompts.md`. It was generated with the built-in image-generation tool using Branching Ribbon as the reference. The production SVG is a manual vector adaptation of that selected artwork; the raster concept remains available for comparison.
