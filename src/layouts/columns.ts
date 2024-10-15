// Copyright (c) 2024 Vjatcheslav V. Kolchkov <akl334@protonmail.ch>
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

class ColumnsLayout implements ILayout {
  public static readonly id = "Columns";
  public parts: ColumnLayout[];
  public readonly classID = ColumnsLayout.id;
  private direction: windRose;
  private _columns: ColumnLayout[];

  public get description(): string {
    return "Columns";
  }
  public get columns(): ColumnLayout[] {
    return this._columns;
  }

  constructor() {
    this.parts = [new ColumnLayout()];
    this._columns = [];
    this.direction = new windRose(CONFIG.columnsLayoutInitialAngle);
  }

  public adjust(
    area: Rect,
    tiles: WindowClass[],
    basis: WindowClass,
    delta: RectDelta
  ) {
    let columnId = this.getColumnId(basis);
    if (columnId === null) return;
    let isReverse = this.direction.east || this.direction.south;
    let columnsLength = this.columns.length;
    // column resize
    if (
      ((this.direction.east || this.direction.west) &&
        (delta.east !== 0 || delta.west !== 0)) ||
      ((this.direction.north || this.direction.south) &&
        (delta.north !== 0 || delta.south !== 0))
    ) {
      let oldWeights: Array<number>;
      if (isReverse) {
        oldWeights = this.columns
          .slice(0)
          .reverse()
          .map((column) => column.weight);
      } else {
        oldWeights = this.columns.map((column) => column.weight);
      }
      const weights = LayoutUtils.adjustAreaWeights(
        area,
        oldWeights,
        CONFIG.tileLayoutGap,
        isReverse ? columnsLength - 1 - columnId : columnId,
        delta,
        this.direction.east || this.direction.west
      );

      weights.forEach((weight, i) => {
        this.columns[isReverse ? columnsLength - 1 - i : i].weight =
          weight * columnsLength;
      });
    }
    if (
      ((delta.north !== 0 || delta.south !== 0) &&
        (this.direction.east || this.direction.west)) ||
      ((delta.east !== 0 || delta.west !== 0) &&
        (this.direction.north || this.direction.south))
    ) {
      this.columns[columnId].adjust(area, tiles, basis, delta);
    }
  }

  public apply(ctx: EngineContext, tileables: WindowClass[], area: Rect): void {
    this.arrangeTileables(ctx, tileables);
    if (this.columns.length === 0) return;
    let weights: Array<number>;
    if (this.direction.east || this.direction.south) {
      weights = this.columns
        .slice(0)
        .reverse()
        .map((tile) => tile.weight);
    } else {
      weights = this.columns.map((tile) => tile.weight);
    }
    const rects = LayoutUtils.splitAreaWeighted(
      area,
      weights,
      CONFIG.tileLayoutGap,
      this.direction.east || this.direction.west
    );
    if (this.direction.east || this.direction.south) {
      let i = 0;
      for (var idx = this.columns.length - 1; idx >= 0; idx--) {
        this.columns[idx].isHorizontal = this.direction.south;
        this.columns[idx].apply(ctx, tileables, rects[i]);
        i++;
      }
    } else {
      for (var idx = 0; idx < this.columns.length; idx++) {
        this.columns[idx].isHorizontal = this.direction.north;
        this.columns[idx].apply(ctx, tileables, rects[idx]);
      }
    }
  }

  public drag(
    ctx: EngineContext,
    draggingRect: Rect,
    window: WindowClass,
    workingArea: Rect
  ): boolean {
    const activationPoint = draggingRect.activationPoint;
    const middlePoint = draggingRect.center;
    if (
      this.columns.length === 0 ||
      (this.columns.length === 1 && this.columns[0].windowIds.size === 1)
    )
      return false;
    let columnId = this.getColumnId(window);
    let windowId = window.id;
    if (
      ((this.direction.north && workingArea.isTopZone(activationPoint)) ||
        (this.direction.south && workingArea.isBottomZone(middlePoint)) ||
        (this.direction.west && workingArea.isLeftZone(activationPoint)) ||
        (this.direction.east && workingArea.isRightZone(activationPoint))) &&
      !(
        this.columns[0].windowIds.size === 1 &&
        this.columns[0].windowIds.has(windowId)
      )
    ) {
      if (columnId !== null) this.columns[columnId].windowIds.delete(windowId);
      const column = this.insertColumn(true);
      column.windowIds.add(windowId);
      return true;
    }
    if (
      ((this.direction.north && workingArea.isBottomZone(middlePoint)) ||
        (this.direction.south && workingArea.isTopZone(activationPoint)) ||
        (this.direction.west && workingArea.isRightZone(activationPoint)) ||
        (this.direction.east && workingArea.isLeftZone(activationPoint))) &&
      !(
        this.columns[this.columns.length - 1].windowIds.size === 1 &&
        this.columns[this.columns.length - 1].windowIds.has(windowId)
      )
    ) {
      if (columnId !== null) this.columns[columnId].windowIds.delete(windowId);
      const column = this.insertColumn(false);
      column.windowIds.add(windowId);
      return true;
    }
    for (let colIdx = 0; colIdx < this.columns.length; colIdx++) {
      const column = this.columns[colIdx];
      for (let i = 0; i < column.renderedWindowsRects.length; i++) {
        const renderedRect = column.renderedWindowsRects[i];
        if (
          (this.direction.west &&
            renderedRect.includesPoint(activationPoint, RectParts.Top)) ||
          (this.direction.north &&
            renderedRect.includesPoint(activationPoint, RectParts.Left)) ||
          (this.direction.east &&
            renderedRect.includesPoint(activationPoint, RectParts.Top)) ||
          (this.direction.south &&
            renderedRect.includesPoint(activationPoint, RectParts.Left))
        ) {
          if (column.renderedWindowsIds[i] === windowId) return false;
          if (i > 0 && column.renderedWindowsIds[i - 1] === windowId)
            return false;

          const renderedId = column.renderedWindowsIds[i];
          if (columnId !== null && columnId !== colIdx)
            this.columns[columnId].windowIds.delete(windowId);
          column.windowIds.add(windowId);
          ctx.moveWindowByWinId(window, renderedId);
          return true;
        }
        if (
          (this.direction.west &&
            renderedRect.includesPoint(activationPoint, RectParts.Bottom)) ||
          (this.direction.north &&
            renderedRect.includesPoint(activationPoint, RectParts.Right)) ||
          (this.direction.east &&
            renderedRect.includesPoint(activationPoint, RectParts.Bottom)) ||
          (this.direction.south &&
            renderedRect.includesPoint(activationPoint, RectParts.Right))
        ) {
          if (column.renderedWindowsIds[i] === windowId) return false;
          if (
            i < column.renderedWindowsIds.length - 1 &&
            column.renderedWindowsIds[i + 1] === windowId
          )
            return false;

          const renderedId = column.renderedWindowsIds[i];
          if (columnId !== null && columnId !== colIdx)
            this.columns[columnId].windowIds.delete(windowId);
          column.windowIds.add(windowId);
          ctx.moveWindowByWinId(window, renderedId, true);
          return true;
        }
      }
    }
    return false;
  }

  private arrangeTileables(ctx: EngineContext, tileables: WindowClass[]) {
    let latestTimestamp: number = 0;
    let partId: number | null = null;
    let newWindows: Set<string> = new Set();
    let tileableIds: Set<string> = new Set();
    let currentColumnId = 0;

    tileables.forEach((tileable) => {
      tileable.state = WindowState.Tiled;
      partId = this.getPartsId(tileable);

      if (partId !== null) {
        if (this.parts[partId].timestamp < tileable.timestamp) {
          this.parts[partId].timestamp = tileable.timestamp;
        }
        if (this.parts[partId].timestamp > latestTimestamp) {
          latestTimestamp = tileable.timestamp;
          currentColumnId = partId;
        }
      } else {
        newWindows.add(tileable.id);
      }
      tileableIds.add(tileable.id);
    });

    this.parts[currentColumnId].windowIds = new Set([
      ...this.parts[currentColumnId].windowIds,
      ...newWindows,
    ]);

    this.parts.forEach((column) => {
      column.actualizeWindowIds(ctx, tileableIds);
    });
    this.parts = this.parts.filter((column) => column.windowIds.size !== 0);
    if (this.parts.length === 0) this.insertColumn(true);
    this.applyColumnsPosition();
  }

  private getColumnId(t: WindowClass): number | null {
    for (var i = 0; i < this.columns.length; i++) {
      if (this.columns[i].windowIds.has(t.id)) return i;
    }
    return null;
  }

  private getPartsId(t: WindowClass): number | null {
    for (var i = 0; i < this.parts.length; i++) {
      if (this.parts[i].windowIds.has(t.id)) return i;
    }
    return null;
  }

  private getCurrentWinId(ctx: EngineContext): string | null {
    return ctx.currentWindow === null ? null : ctx.currentWindow.id;
  }

  private getCurrentColumnId(currentWindowId: string | null): number | null {
    if (currentWindowId !== null) {
      for (const [i, column] of this.columns.entries()) {
        if (column.windowIds.has(currentWindowId)) return i;
      }
    }
    return null;
  }

  private applyColumnsPosition() {
    this._columns = this.parts.filter((column) => !column.isEmpty());
    const columnsLength = this.columns.length;
    if (columnsLength === 1) {
      this.columns[0].position = "single";
    } else if (columnsLength > 1) {
      this.columns[0].position = "left";
      this.columns[columnsLength - 1].position = "right";
      for (let i = 1; i < columnsLength - 1; i++) {
        this.columns[i].position = "middle";
      }
    }
  }

  private toColumnWithBiggerIndex(ctx: EngineContext): boolean {
    const currentWindow = ctx.currentWindow;
    const currentWindowId = currentWindow !== null ? currentWindow.id : null;
    const activeColumnId = this.getCurrentColumnId(currentWindowId);

    if (
      currentWindow === null ||
      currentWindowId === null ||
      activeColumnId === null ||
      (this.columns[activeColumnId].size < 2 &&
        (this.columns[activeColumnId].position === "right" ||
          this.columns[activeColumnId].position === "single"))
    )
      return false;

    let targetColumn: ColumnLayout;
    const column = this.columns[activeColumnId];
    const center =
      column.renderedWindowsRects[
        column.renderedWindowsIds.indexOf(currentWindowId)
      ].center;
    column.windowIds.delete(currentWindowId);

    if (column.position === "single" || column.position === "right") {
      targetColumn = this.insertColumn(false);
      targetColumn.windowIds.add(currentWindowId);
    } else {
      targetColumn = this.columns[activeColumnId + 1];
      targetColumn.windowIds.add(currentWindowId);
    }
    let idOnTarget: string | null;
    if (this.direction.north || this.direction.south)
      idOnTarget = targetColumn.getWindowIdOnRight(center[0]);
    else idOnTarget = targetColumn.getWindowIdOnTop(center[1]);
    if (idOnTarget !== null) ctx.moveWindowByWinId(currentWindow, idOnTarget);
    else {
      const targetId =
        targetColumn.renderedWindowsIds[
          targetColumn.renderedWindowsIds.length - 1
        ];
      ctx.moveWindowByWinId(currentWindow, targetId);
    }
    this.applyColumnsPosition();
    return true;
  }

  private toColumnWithSmallerIndex(ctx: EngineContext): boolean {
    const currentWindow = ctx.currentWindow;
    const currentWindowId = currentWindow !== null ? currentWindow.id : null;
    const activeColumnId = this.getCurrentColumnId(currentWindowId);

    if (
      currentWindow === null ||
      currentWindowId === null ||
      activeColumnId === null ||
      (this.columns[activeColumnId].windowIds.size < 2 &&
        (this.columns[activeColumnId].position === "left" ||
          this.columns[activeColumnId].position === "single"))
    )
      return false;

    let targetColumn: ColumnLayout;
    const column = this.columns[activeColumnId];
    const center =
      column.renderedWindowsRects[
        column.renderedWindowsIds.indexOf(currentWindowId)
      ].center;
    column.windowIds.delete(currentWindowId);

    if (column.position === "single" || column.position === "left") {
      targetColumn = this.insertColumn(true);
      targetColumn.windowIds.add(currentWindowId);
    } else {
      targetColumn = this.columns[activeColumnId - 1];
      targetColumn.windowIds.add(currentWindowId);
    }
    let idOnTarget: string | null;
    if (this.direction.north || this.direction.south)
      idOnTarget = targetColumn.getWindowIdOnRight(center[0]);
    else idOnTarget = targetColumn.getWindowIdOnTop(center[1]);
    if (idOnTarget !== null) ctx.moveWindowByWinId(currentWindow, idOnTarget);
    else {
      const targetId =
        targetColumn.renderedWindowsIds[
          targetColumn.renderedWindowsIds.length - 1
        ];
      ctx.moveWindowByWinId(currentWindow, targetId);
    }
    this.applyColumnsPosition();
    return true;
  }

  private toUpOrLeft(ctx: EngineContext): boolean {
    let currentWindow = ctx.currentWindow;
    let currentWindowId = currentWindow !== null ? currentWindow.id : null;
    let activeColumnId = this.getCurrentColumnId(currentWindowId);

    if (
      currentWindow === null ||
      currentWindowId === null ||
      activeColumnId === null ||
      this.columns[activeColumnId].windowIds.size < 2
    )
      return false;
    let upperWinId =
      this.columns[activeColumnId].getUpperWindowId(currentWindowId);
    if (upperWinId === null) return false;
    ctx.moveWindowByWinId(currentWindow, upperWinId);
    return true;
  }

  private toBottomOrRight(ctx: EngineContext): boolean {
    let currentWindow = ctx.currentWindow;
    let currentWindowId = currentWindow !== null ? currentWindow.id : null;
    let activeColumnId = this.getCurrentColumnId(currentWindowId);

    if (
      currentWindow === null ||
      currentWindowId === null ||
      activeColumnId === null ||
      this.columns[activeColumnId].windowIds.size < 2
    )
      return false;
    let lowerWinId =
      this.columns[activeColumnId].getLowerWindowId(currentWindowId);
    if (lowerWinId === null) return false;
    ctx.moveWindowByWinId(currentWindow, lowerWinId, true);
    return true;
  }

  public showDirection(ctx: EngineContext) {
    let notification: string;
    if (this.direction.east) notification = "vertical ⟰";
    else if (this.direction.north) notification = "horizontal ⭆";
    else if (this.direction.west) notification = "vertical ⟱";
    else if (this.direction.south) notification = "horizontal ⭅";
    else notification = "";
    ctx.showNotification(notification);
  }

  public handleShortcut(ctx: EngineContext, input: Shortcut) {
    let isApply: boolean = false;
    switch (input) {
      case Shortcut.SwapLeft:
        if (this.direction.north || this.direction.south) {
          isApply = this.toUpOrLeft(ctx);
        } else if (this.direction.east) {
          isApply = this.toColumnWithBiggerIndex(ctx);
        } else isApply = this.toColumnWithSmallerIndex(ctx);
        break;
      case Shortcut.SwapRight:
        if (this.direction.north || this.direction.south) {
          isApply = this.toBottomOrRight(ctx);
        } else if (this.direction.east) {
          isApply = this.toColumnWithSmallerIndex(ctx);
        } else isApply = this.toColumnWithBiggerIndex(ctx);
        break;
      case Shortcut.SwapUp:
        if (this.direction.north) {
          isApply = this.toColumnWithSmallerIndex(ctx);
        } else if (this.direction.south) {
          isApply = this.toColumnWithBiggerIndex(ctx);
        } else isApply = this.toUpOrLeft(ctx);
        break;
      case Shortcut.SwapDown:
        if (this.direction.north) {
          isApply = this.toColumnWithBiggerIndex(ctx);
        } else if (this.direction.south) {
          isApply = this.toColumnWithSmallerIndex(ctx);
        } else isApply = this.toBottomOrRight(ctx);
        break;
      case Shortcut.Rotate:
        this.direction.cwRotation();
        this.showDirection(ctx);
        isApply = true;
        break;
      case Shortcut.RotatePart:
        this.direction.ccwRotation();
        this.showDirection(ctx);
        isApply = true;
        break;

      default:
        return false;
    }
    return isApply;
  }

  private insertColumn(onTop: boolean): ColumnLayout {
    let column = new ColumnLayout();
    this.parts.splice(onTop ? 0 : this.parts.length, 0, column);
    return column;
  }
}
