import assert from "node:assert/strict";
import test from "node:test";
import history from "../web/history.cjs";

const { createHistory, same, LIMIT } = history;

const move = (id, from, to) => ({ id, from, to });

test("an empty history has nothing to undo or redo", () => {
  const trail = createHistory();
  assert.equal(trail.undo(), null);
  assert.equal(trail.redo(), null);
  assert.deepEqual(trail.size(), { undo: 0, redo: 0 });
});

test("undo returns each card's old spot and redo its new one", () => {
  const trail = createHistory();
  trail.record({ label: "move", moves: [move("a", { x: 1, y: 2 }, { x: 10, y: 20 })] });
  const undone = trail.undo();
  assert.deepEqual(undone, { label: "move", moves: [{ id: "a", spot: { x: 1, y: 2 } }] });
  assert.deepEqual(trail.size(), { undo: 0, redo: 1 });
  const redone = trail.redo();
  assert.deepEqual(redone, { label: "move", moves: [{ id: "a", spot: { x: 10, y: 20 } }] });
  assert.deepEqual(trail.size(), { undo: 1, redo: 0 });
});

test("a card the layout placed undoes to null, and redo pins it again", () => {
  const trail = createHistory();
  trail.record({ label: "move", moves: [move("a", null, { x: 5, y: 6 })] });
  assert.deepEqual(trail.undo().moves, [{ id: "a", spot: null }]);
  assert.deepEqual(trail.redo().moves, [{ id: "a", spot: { x: 5, y: 6 } }]);
});

test("steps undo newest first and redo in the order they were undone", () => {
  const trail = createHistory();
  trail.record({ label: "one", moves: [move("a", null, { x: 1, y: 1 })] });
  trail.record({ label: "two", moves: [move("a", { x: 1, y: 1 }, { x: 2, y: 2 })] });
  assert.equal(trail.undo().label, "two");
  assert.equal(trail.undo().label, "one");
  assert.equal(trail.undo(), null);
  assert.equal(trail.redo().label, "one");
  assert.equal(trail.redo().label, "two");
  assert.equal(trail.redo(), null);
});

test("a gesture that ends where it began is not recorded", () => {
  const trail = createHistory();
  assert.equal(trail.record({ label: "move", moves: [move("a", { x: 3, y: 4 }, { x: 3, y: 4 })] }), false);
  assert.equal(trail.record({ label: "move", moves: [move("a", null, null)] }), false);
  assert.equal(trail.record({ label: "move", moves: [] }), false);
  assert.equal(trail.record(null), false);
  assert.deepEqual(trail.size(), { undo: 0, redo: 0 });
  assert.equal(
    trail.record({ label: "layout", moves: [move("a", { x: 3, y: 4 }, { x: 3, y: 4 }), move("b", null, { x: 1, y: 1 })] }),
    true,
  );
  assert.deepEqual(trail.undo().moves, [{ id: "b", spot: null }]);
});

test("a new gesture drops what could have been redone", () => {
  const trail = createHistory();
  trail.record({ label: "one", moves: [move("a", null, { x: 1, y: 1 })] });
  trail.undo();
  assert.deepEqual(trail.size(), { undo: 0, redo: 1 });
  trail.record({ label: "two", moves: [move("b", null, { x: 2, y: 2 })] });
  assert.deepEqual(trail.size(), { undo: 1, redo: 0 });
  assert.equal(trail.redo(), null);
});

test("one entry restores every card of the gesture together", () => {
  const trail = createHistory();
  trail.record({
    label: "layout",
    moves: [move("a", { x: 1, y: 1 }, null), move("b", { x: 2, y: 2 }, null), move("c", null, { x: 3, y: 3 })],
  });
  assert.deepEqual(trail.undo().moves, [
    { id: "a", spot: { x: 1, y: 1 } },
    { id: "b", spot: { x: 2, y: 2 } },
    { id: "c", spot: null },
  ]);
});

test("the history keeps the newest hundred steps", () => {
  assert.equal(LIMIT, 100);
  const trail = createHistory();
  for (let i = 0; i < LIMIT + 5; i += 1) trail.record({ label: String(i), moves: [move("a", { x: i, y: 0 }, { x: i + 1, y: 0 })] });
  assert.equal(trail.size().undo, LIMIT);
  let last = null;
  for (let step = trail.undo(); step; step = trail.undo()) last = step;
  assert.equal(last.label, "5");
});

test("recorded and returned spots are copies the caller cannot alias", () => {
  const trail = createHistory();
  const from = { x: 1, y: 1 };
  const to = { x: 2, y: 2 };
  trail.record({ label: "move", moves: [move("a", from, to)] });
  from.x = 99;
  to.y = 99;
  const undone = trail.undo();
  assert.deepEqual(undone.moves[0].spot, { x: 1, y: 1 });
  undone.moves[0].spot.x = 77;
  assert.deepEqual(trail.redo().moves[0].spot, { x: 2, y: 2 });
  assert.deepEqual(trail.undo().moves[0].spot, { x: 1, y: 1 });
});

test("same compares spots, treating null as the layout's own place", () => {
  assert.equal(same(null, null), true);
  assert.equal(same(undefined, null), true);
  assert.equal(same({ x: 1, y: 2 }, { x: 1, y: 2 }), true);
  assert.equal(same({ x: 1, y: 2 }, { x: 1, y: 3 }), false);
  assert.equal(same({ x: 1, y: 2 }, null), false);
});
