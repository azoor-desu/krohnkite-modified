// Copyright (c) 2018-2019 Eon S. Jeon <esjeon@hyunmu.am>
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

// Description:
// Modified behaviour from Three-Column.
// - Master stack on the LEFT instead of middle.
class TripleColumnLeft implements ILayout {
  public static readonly MIN_MASTER_RATIO = 0.2;
  public static readonly MAX_MASTER_RATIO = 0.75;
  public static readonly id = "TripleColumnLeft";

  public readonly classID = TripleColumnLeft.id;

  public get description(): string {
    return "Triple Column Left [" + this.masterSize + "]";
  }

  private masterRatio: number; // ratio of horizontal screen space for master stack. Other 2 columns will have an equal split of the remaining ratio.
  private masterSize: number;  // How many windows to fit in the master column. Set by user.

  constructor() {
    this.masterRatio = 0.6;
    this.masterSize = 1;
  }

  // Probably for adusting window size.
  // tiles is all the windows in the context
  // basis is the window being adjusted
  public adjust(
    area: Rect,
    tiles: WindowClass[],
    basis: WindowClass,
    delta: RectDelta
  ): void {
    // Nothing to do if no window or 1 window
    if (tiles.length <= 1) return;

    const basisIndex = tiles.indexOf(basis);
    if (basisIndex < 0) return;

    // basisIndex === 0 is master stack.
    // Handles adjusting only master stack window.
    if (basisIndex === 0) {
      // Adjust master ratio
      this.masterRatio = LayoutUtils.adjustAreaHalfWeights(
        area,
        this.masterRatio,
        CONFIG.tileLayoutGap,
        basisIndex,
        delta,
        true
      );
      return;
    }

    if (tiles.length === 2) {
      if (delta.west != 0) {
        // Modify MASTER RATIO.
        this.masterRatio = LayoutUtils.adjustAreaHalfWeights(
          area, /* we only need width */
          this.masterRatio,
          CONFIG.tileLayoutGap,
          1, // left side being modified
          delta,
          true
        )
      }
      return;
    }

    // tiles.length === 3 is 1 master on left, 2 vertical stack on right.
    if (tiles.length === 3) {
      // Adjust vertical ratios for right-side stack
      const ratios = LayoutUtils.adjustAreaWeights(
        area, // dont worry about area being the full screen, we just care about the y-height of the R-stack
        [tiles[1].weight, tiles[2].weight],
        CONFIG.tileLayoutGap,
        basisIndex - 1, // target relative to tile[1] and [2] array, so 2 values only lol
        delta,
        false
      );
      tiles[1].weight = ratios[0];
      tiles[2].weight = ratios[1];

      if (delta.west != 0) {
        // Modify MASTER RATIO.
        this.masterRatio = LayoutUtils.adjustAreaHalfWeights(
          area, /* we only need width */
          this.masterRatio,
          CONFIG.tileLayoutGap,
          1,  // left side being modified
          delta,
          true
        )
      }
      return;
    }

    if (tiles.length <= this.masterSize) {
      /* one column */
      LayoutUtils.adjustAreaWeights(
        area,
        tiles.map((tile) => tile.weight),
        CONFIG.tileLayoutGap,
        tiles.indexOf(basis),
        delta
      ).forEach((newWeight, i) => (tiles[i].weight = newWeight * tiles.length));
    }
    else if (tiles.length === this.masterSize + 1) {
      /* two columns */

      /* adjust master-stack ratio */
      this.masterRatio = LayoutUtils.adjustAreaHalfWeights(
        area,
        this.masterRatio,
        CONFIG.tileLayoutGap,
        basisIndex < this.masterSize ? 0 : 1,
        delta,
        true
      );

      /* adjust master tile weights */
      if (basisIndex < this.masterSize) {
        const masterTiles = tiles.slice(0, -1);
        LayoutUtils.adjustAreaWeights(
          area,
          masterTiles.map((tile) => tile.weight),
          CONFIG.tileLayoutGap,
          basisIndex,
          delta
        ).forEach(
          (newWeight, i) =>
            (masterTiles[i].weight = newWeight * masterTiles.length)
        );
      }
    }
    else if (tiles.length > this.masterSize + 1) {
      /* three columns */
      let basisGroup;
      if (basisIndex < this.masterSize) basisGroup = 0; /* master */
      else if (basisIndex < Math.floor((this.masterSize + tiles.length) / 2))
        basisGroup = 2; /* R-stack */
      else basisGroup = 1; /* L-stack */

      /* adjust master-stack ratio */
      const stackRatio = 1 - this.masterRatio;
      const newRatios = LayoutUtils.adjustAreaWeights(
        area,
        [this.masterRatio, stackRatio, stackRatio],
        CONFIG.tileLayoutGap,
        basisGroup,
        delta,
        true
      );
      const newMasterRatio = newRatios[0];
      const newStackRatio = basisGroup === 1 ? newRatios[1] : newRatios[2];
      this.masterRatio = newMasterRatio / (newMasterRatio + newStackRatio);

      /* adjust tile weight */
      const rstackNumTile = Math.floor((tiles.length - this.masterSize) / 2);
      const [masterTiles, rstackTiles, lstackTiles] =
        partitionArrayBySizes<WindowClass>(tiles, [
          this.masterSize,
          rstackNumTile,
        ]);
      const groupTiles = [masterTiles, lstackTiles, rstackTiles][basisGroup];
      LayoutUtils.adjustAreaWeights(
        area /* we only need height */,
        groupTiles.map((tile) => tile.weight),
        CONFIG.tileLayoutGap,
        groupTiles.indexOf(basis),
        delta
      ).forEach(
        (newWeight, i) => (groupTiles[i].weight = newWeight * groupTiles.length)
      );
    }
  }

  // Apply tiling logic to all windows in this context (screen)
  public apply(ctx: EngineContext, tileables: WindowClass[], area: Rect): void {
    /* Tile all tileables */
    tileables.forEach((tileable) => (tileable.state = WindowState.Tiled));
    const tiles = tileables;

    // 1 window = whole area
    if (tiles.length === 1) {
      tiles[0].geometry = area;
      return;
    }

    // 2 window = split horizontal
    if (tiles.length === 2) {
      const [masterArea, stackArea] = LayoutUtils.splitAreaHalfWeighted(
        area,
        this.masterRatio,
        CONFIG.tileLayoutGap,
        true
      );
      tiles[0].geometry = masterArea;
      tiles[1].geometry = stackArea;
      return;
    }

    // 3 window: split main left, stack 2 right vertically
    if (tiles.length === 3) {
      // Set master stack area.
      const [masterArea, stackArea] = LayoutUtils.splitAreaHalfWeighted(
        area,
        this.masterRatio,
        CONFIG.tileLayoutGap,
        true
      );
      tiles[0].geometry = masterArea;

      // Set other stack area.
      // Splits the right side stack area vertically between tileables[1] and [2]
      LayoutUtils.splitAreaWeighted(
        stackArea,
        [tiles[1].weight, tiles[2].weight],
        CONFIG.tileLayoutGap,
        false,
        // i + 1 cos i don't want to make a new array just for stack items, so just offset by 1 (num of tiles in master stack) from the main array
      ).forEach((tileArea, i) => (tiles[i + 1].geometry = tileArea));
      return;
    }

    // if num of tiles less than/equal to master vertical window limit, 
    // only tile vertically in master column (no other columns either so yeah.)
    if (tiles.length <= this.masterSize) {
      /* only master */
      LayoutUtils.splitAreaWeighted(
        area,
        tiles.map((tile) => tile.weight),
        CONFIG.tileLayoutGap
      ).forEach((tileArea, i) => (tiles[i].geometry = tileArea));

      // if num of tiles exceeds the vertical master column limit by EXACTLY 1, 
      // do master column + R-stack. R-stack should have only 1 window.
    }
    // if num of tiles less than/equal to master vertical window limit, 
    // only tile vertically in master column (no other columns either so yeah.)
    else if (tiles.length === this.masterSize + 1) {
      /* master & R-stack (only 1 window in stack) */
      const [masterArea, stackArea] = LayoutUtils.splitAreaHalfWeighted(
        area,
        this.masterRatio,
        CONFIG.tileLayoutGap,
        true
      );

      const masterTiles = tiles.slice(0, this.masterSize);
      LayoutUtils.splitAreaWeighted(
        masterArea,
        masterTiles.map((tile) => tile.weight),
        CONFIG.tileLayoutGap
      ).forEach((tileArea, i) => (masterTiles[i].geometry = tileArea));

      tiles[tiles.length - 1].geometry = stackArea;

      // if num of tiles exceeds the vertical master column limit by 2 or more,
      // do master, L-stack and R-stack.
    } 
    else if (tiles.length > this.masterSize + 1) {
      /* L-stack & master & R-stack */
      const stackRatio = 1 - this.masterRatio;

      /** Areas allocated to L-stack, master, and R-stack */
      const groupAreas = LayoutUtils.splitAreaWeighted(
        area,
        [this.masterRatio, stackRatio, stackRatio],
        CONFIG.tileLayoutGap,
        true
      );

      const rstackSize = Math.floor((tiles.length - this.masterSize) / 2);
      const [masterTiles, lstackTiles, rstackTiles] =
        partitionArrayBySizes<WindowClass>(tiles, [
          this.masterSize,
          rstackSize,
        ]);
      [masterTiles, lstackTiles, rstackTiles].forEach((groupTiles, group) => {
        LayoutUtils.splitAreaWeighted(
          groupAreas[group],
          groupTiles.map((tile) => tile.weight),
          CONFIG.tileLayoutGap
        ).forEach((tileArea, i) => (groupTiles[i].geometry = tileArea));
      });
    }
  }

  public clone(): ILayout {
    const other = new TripleColumnLeft();
    other.masterRatio = this.masterRatio;
    other.masterSize = this.masterSize;
    return other;
  }

  // TODO: Modify the move shortcut behaviour
  public handleShortcut(
    ctx: EngineContext,
    input: Shortcut,
    data?: any
  ): boolean {
    switch (input) {
      case Shortcut.Increase:
        this.resizeMaster(ctx, +1);
        return true;
      case Shortcut.Decrease:
        this.resizeMaster(ctx, -1);
        return true;
      case Shortcut.DWMLeft:
        this.masterRatio = clip(
          slide(this.masterRatio, -0.05),
          TripleColumnLeft.MIN_MASTER_RATIO,
          TripleColumnLeft.MAX_MASTER_RATIO
        );
        return true;
      case Shortcut.DWMRight:
        this.masterRatio = clip(
          slide(this.masterRatio, +0.05),
          TripleColumnLeft.MIN_MASTER_RATIO,
          TripleColumnLeft.MAX_MASTER_RATIO
        );
        return true;
      default:
        return false;
    }
  }

  public toString(): string {
    return "TripleColumnLeft(nmaster=" + this.masterSize + ")";
  }

  private resizeMaster(ctx: EngineContext, step: -1 | 1): void {
    this.masterSize = clip(this.masterSize + step, 1, 10);
    ctx.showNotification(this.description);
  }
}
