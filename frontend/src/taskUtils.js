export const localToday = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const isOverdue = (task, today = localToday()) => !task.completed && !!task.dueDate && task.dueDate < today;
export function visibleTasks(tasks, mine, username) {
  return tasks.filter(task => !mine || task.assignedName === username).sort((a, b) =>
    Number(a.completed) - Number(b.completed) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.title.localeCompare(b.title, 'de'));
}
