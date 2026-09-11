import test from 'node:test';
import assert from 'node:assert/strict';
import { localToday, isOverdue, visibleTasks } from './taskUtils.js';
test('Aufgaben werden erst nach dem lokalen Fälligkeitstag überfällig', () => {
  assert.equal(localToday(new Date(2026, 8, 11, 0, 5)), '2026-09-11');
  assert.equal(isOverdue({ dueDate: '2026-09-11' }, '2026-09-11'), false);
  assert.equal(isOverdue({ dueDate: '2026-09-10' }, '2026-09-11'), true);
  assert.equal(isOverdue({ dueDate: '2026-09-10', completed: true }, '2026-09-11'), false);
  assert.equal(isOverdue({ dueDate: '' }), false);
});
test('Meine Aufgaben filtert Zuständigkeit und sortiert offene Aufgaben zuerst', () => {
  const tasks = [
    { title: 'A', assignedName: 'Robert', completed: false, dueDate: '' },
    { title: 'B', assignedName: 'Matthias', completed: true, dueDate: '2026-09-01' },
    { title: 'C', assignedName: 'Matthias', completed: false, dueDate: '2026-09-12' },
  ];
  assert.deepEqual(visibleTasks(tasks, true, 'Matthias').map(t => t.title), ['C', 'B']);
  assert.deepEqual(visibleTasks(tasks, false, 'Matthias').map(t => t.title), ['C', 'A', 'B']);
  assert.equal(tasks[0].title, 'A');
});
