"use strict";

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SmartypantsHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var LIMIT = 100;

  function copy(spot) {
    return spot ? { x: spot.x, y: spot.y } : null;
  }

  function same(a, b) {
    if (!a || !b) return !a && !b;
    return a.x === b.x && a.y === b.y;
  }

  /**
   * Undo and redo for where cards sit. One entry is one gesture:
   *   { label, moves: [{ id, from, to }] }
   * `from` and `to` are { x, y }, or null when the layout places the card.
   * undo() and redo() return { label, moves: [{ id, spot }] } for the caller to
   * apply (spot is where each card goes), or null when there is nothing to do.
   */
  function createHistory(limit) {
    var cap = limit || LIMIT;
    var done = [];
    var undone = [];

    function record(entry) {
      var moves = ((entry && entry.moves) || [])
        .filter(function (move) { return !same(move.from, move.to); })
        .map(function (move) { return { id: move.id, from: copy(move.from), to: copy(move.to) }; });
      if (!moves.length) return false;
      done.push({ label: entry.label, moves: moves });
      if (done.length > cap) done.shift();
      undone.length = 0;
      return true;
    }

    function step(source, target, side) {
      var entry = source.pop();
      if (!entry) return null;
      target.push(entry);
      return { label: entry.label, moves: entry.moves.map(function (move) { return { id: move.id, spot: copy(move[side]) }; }) };
    }

    return {
      record: record,
      undo: function () { return step(done, undone, "from"); },
      redo: function () { return step(undone, done, "to"); },
      size: function () { return { undo: done.length, redo: undone.length }; },
    };
  }

  return { createHistory: createHistory, same: same, LIMIT: LIMIT };
});
