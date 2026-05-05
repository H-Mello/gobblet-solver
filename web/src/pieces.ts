import type { Player, Size } from "../../src/index.js";

const COLORS: Record<Player, string> = {
  0: "#2c6df0",
  1: "#f08a2c",
};

const RADII: Record<Size, number> = {
  1: 18,  // small
  2: 30,  // medium
  3: 40,  // large (out of viewBox 100)
};

export function pieceSVG(
  owner: Player,
  size: Size,
  opts: { selected?: boolean; dim?: boolean } = {},
): string {
  const r = RADII[size];
  const stroke = opts.selected ? "#000" : "transparent";
  const opacity = opts.dim ? 0.35 : 1;
  return `<svg viewBox="0 0 100 100" class="piece" data-size="${size}" data-owner="${owner}">
    <circle cx="50" cy="50" r="${r}" fill="${COLORS[owner]}" stroke="${stroke}" stroke-width="3" opacity="${opacity}" />
  </svg>`;
}
