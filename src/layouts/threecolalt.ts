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
// - L/R stacks prioritize splitting screen vertically first
// - No more master "stack". Master stack is always 1 window.
class ThreeColAlt implements ILayout {
  public static readonly MIN_MASTER_RATIO = 0.2;
  public static readonly MAX_MASTER_RATIO = 0.75;
  public static readonly id = "ThreeColAlt";

  public readonly classID = ThreeColAlt.id;

  public get description(): string {
    return "Three Column Alt";
  }

  private masterHorizontalWeight: number; // ratio of horizontal screen space for master stack. Other 2 columns will have an equal split of the remaining ratio.

  constructor() {
    this.masterHorizontalWeight = 0.5;
  }

  // Called when a window size is being adjusted
  // tiles is all the windows in the context
  // basis is the window being adjusted
  // Modify tile weights only, apply will be called after this.
  public adjust(
    area: Rect,
    tiles: WindowClass[],
    basis: WindowClass,
    delta: RectDelta
  ): void {
    // Nothing to do if no window or 1 window
    if (tiles.length <= 1) return;

    // Get index of the basis window
    const basisIndex = tiles.indexOf(basis);
    if (basisIndex < 0) return;
    
    // basisIndex === 0 is master stack.
    // Handles adjusting only master stack window.
    if (basisIndex === 0) {
      // Adjust master ratio
      this.masterHorizontalWeight = LayoutUtils.adjustAreaHalfWeights(
        area,
        this.masterHorizontalWeight,
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
        this.masterHorizontalWeight = LayoutUtils.adjustAreaHalfWeights(
          area, /* we only need width */
          this.masterHorizontalWeight,
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
        this.masterHorizontalWeight = LayoutUtils.adjustAreaHalfWeights(
          area, /* we only need width */
          this.masterHorizontalWeight,
          CONFIG.tileLayoutGap,
          1,  // left side being modified
          delta,
          true
        )
      }
      return;
    }

    // 1 window left master, stacking splits on right
    if (tiles.length > 3) {
      // If modifying height,
      // Identify the row index the basis is in.
      // adjust the weights using stackRowWeights as the original weights, and the row index as target.
      // Update stackRowWeights with the new weights.
      if (delta.north != 0 || delta.south != 0){
        // get row index as target
        const basisRowIndex = Math.floor((basisIndex - 1) / 2);
        const rowCount = Math.ceil((tiles.length-1) / 2);
        // get adjusted weights, slap them into the rowTiles.
        let leftSideTiles = new Array<WindowClass>(rowCount);
        for (let i = 0, iStackTiles = 1; i < rowCount; i++, iStackTiles += 2) {
          leftSideTiles[i] = tiles[iStackTiles];
        }
        LayoutUtils.adjustAreaWeights(
          area, /* we only need height */
          leftSideTiles.map((tile) => tile.weight),
          CONFIG.tileLayoutGap,
          basisRowIndex,
          delta, // how much height is being modified for that row
          false
        ).forEach((newWeight, i) => (leftSideTiles[i].weight = newWeight)); // apply to tiles.
      }

      // If modifying width, check if basis is part of the left-column tiles, and the west side is being modified.
      //  If yes, adjust the master ratio.
      // Otherwise, get the area of the local 2 tiles (area of stack will do), and plonk in the weights of both tiles.
      // Get the adjusted x weights and apply them to the 2 tiles.
      if (delta.west != 0 && basisIndex % 2 === 1) {
        // Modify MASTER RATIO.
        this.masterHorizontalWeight = LayoutUtils.adjustAreaHalfWeights(
          area, /* we only need width */
          this.masterHorizontalWeight,
          CONFIG.tileLayoutGap,
          1, // left side being modified
          delta,
          true
        )
      }
      else if (delta.east != 0 || delta.west != 0) {
        // Modify local ratio between the 2 tiles in the same row.

        // Get right-side stack horizontal area
        const stackArea = LayoutUtils.splitAreaHalfWeighted(
          area,
          this.masterHorizontalWeight,
          CONFIG.tileLayoutGap,
          true
        )[1];
        // Check if the modified tile is a left tile or not. Calculate and assign new weight to this tile.
        const isRightTile = (basisIndex % 2 === 0) ? 1 : 0;
        const lTileWeight = 1 - tiles[basisIndex + isRightTile].weight
        tiles[basisIndex].weight = LayoutUtils.adjustAreaHalfWeights(
          stackArea, /* we only need width */
          lTileWeight,
          CONFIG.tileLayoutGap,
          isRightTile,
          delta,
          true
        )
        // Update value in the other tile too.
        tiles[basisIndex + (isRightTile ? -1 : 1)].weight = 1 - tiles[basisIndex].weight;
      }
      return;
    }
  }

  // Tiling logic to apply to windows
  public apply(
    ctx: EngineContext, 
    tileables: WindowClass[], 
    area: Rect
  ): void {
    /* Tile all tileables */
    tileables.forEach((tileable) => (tileable.state = WindowState.Tiled));

    // 1 window = whole area
    if (tileables.length === 1) {
      tileables[0].geometry = area;
      return;
    }

    // 2 window = split horizontal
    if (tileables.length === 2) {
      const [masterArea, stackArea] = LayoutUtils.splitAreaHalfWeighted(
        area,
        this.masterHorizontalWeight,
        CONFIG.tileLayoutGap,
        true
      );
      tileables[0].geometry = masterArea;
      tileables[1].geometry = stackArea;
      return;
    }

    // 3 window: split main left, stack 2 right vertically
    if (tileables.length === 3) {
      // Set master stack area.
      const [masterArea, stackArea] = LayoutUtils.splitAreaHalfWeighted(
        area,
        this.masterHorizontalWeight,
        CONFIG.tileLayoutGap,
        true
      );
      tileables[0].geometry = masterArea;
      
      // Set other stack area.
      // Splits the right side stack area vertically between tileables[1] and [2]
      LayoutUtils.splitAreaWeighted(
        stackArea,
        [tileables[1].weight, tileables[2].weight],
        CONFIG.tileLayoutGap,
        false,
        // i + 1 cos i don't want to make a new array just for stack items, so just offset by 1 (num of tiles in master stack) from the main array
      ).forEach((tileArea, i) => (tileables[i + 1].geometry = tileArea));
      return;
    }

    // 4 and more window: split main left, stack rest on right
    if (tileables.length > 3) {
      // Set master stack area.
      const [masterArea, stackArea] = LayoutUtils.splitAreaHalfWeighted(
        area,
        this.masterHorizontalWeight,
        CONFIG.tileLayoutGap,
        true
      );
      tileables[0].geometry = masterArea;

      // Set other stack area.
      // Get array of tiles w/o the first tile
      const stackTiles = tileables.slice(1);

      // count the number of tiles, and derive the number of rows we'd need.
      // 2 items in 1 row. Ceiling the value to account for last guy without a buddy.
      const rowCount = Math.ceil(stackTiles.length / 2);

      // Split stackArea into rowAreas, each with 2 tiles (horizontally).
      // Weights for the left tile represents the HIEGHT weight. Weights for the right tile represents the WIDTH weight.
      // If no right tile, that row just has the HEIGHT weight.

      // Grab weights from the existing tiles and store it for use later.
      const lastRowIsSingle = (stackTiles.length % 2 != 0); // is last row single or paired with another tile
      let rowWeightsHeight = new Array<number>(rowCount);
      let rowWeightsWidth = new Array<number>(lastRowIsSingle ? rowCount - 1 : rowCount);
      for (let i = 0, iStackTiles = 0; i < rowCount; i++, iStackTiles+=2) {
        rowWeightsHeight[i] = stackTiles[iStackTiles].weight;
        if (!(lastRowIsSingle && iStackTiles + 1 < stackTiles.length)) 
          rowWeightsWidth[i] = stackTiles[iStackTiles + 1].weight;
      }

      const rowAreas = LayoutUtils.splitAreaWeighted(
        stackArea,
        rowWeightsHeight,
        CONFIG.tileLayoutGap,
        false
      )

      // for each row area, split the area horizontally into 2 (if in a pair)
      // Set the area.
      for (let i = 0, iStackTiles = 0; i < rowCount; i++) {
        if (lastRowIsSingle && i == (rowCount - 1)) {
            stackTiles[iStackTiles].geometry = rowAreas[i];
        } 
        else {
          LayoutUtils.splitAreaHalfWeighted(
            rowAreas[i],
            1 - rowWeightsWidth[i],
            CONFIG.tileLayoutGap,
            true
          ).forEach((tileArea, j) => {
            stackTiles[iStackTiles + j].geometry = tileArea;
          });
      }
        iStackTiles += 2;
      }
      return;
    }
  }

  public clone(): ILayout {
    const other = new ThreeColAlt();
    other.masterHorizontalWeight = this.masterHorizontalWeight;
    return other;
  }

  // TODO: Modify the move shortcut behaviour
  public handleShortcut(
    ctx: EngineContext,
    input: Shortcut,
    data?: any
  ): boolean {
    switch (input) {
      case Shortcut.DWMLeft:
        this.masterHorizontalWeight = clip(
          slide(this.masterHorizontalWeight, -0.05),
          ThreeColAlt.MIN_MASTER_RATIO,
          ThreeColAlt.MAX_MASTER_RATIO
        );
        return true;
      case Shortcut.DWMRight:
        this.masterHorizontalWeight = clip(
          slide(this.masterHorizontalWeight, +0.05),
          ThreeColAlt.MIN_MASTER_RATIO,
          ThreeColAlt.MAX_MASTER_RATIO
        );
        return true;
      default:
        return false;
    }
  }

  public toString(): string {
    return "ThreeColAlt";
  }
}
