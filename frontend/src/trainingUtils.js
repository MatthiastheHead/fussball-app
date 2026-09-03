export const STATUS_OPTIONS = [
  { icon: '✅', label: 'Teilgenommen' },
  { icon: '❌', label: 'Abgemeldet' },
  { icon: '⏳', label: 'Nicht abgemeldet' },
];

export const RATING_VALUES = [1, 2, 3];

export const iconToText = (icon) => {
  if (icon === '✅') return 'Teilgenommen';
  if (icon === '❌') return 'Abgemeldet';
  return 'Nicht abgemeldet';
};

export const normalizeRating = (value) => {
  const rating = Number(value);
  return Number.isFinite(rating) ? Math.max(0, Math.min(3, Math.round(rating))) : 0;
};

export const ratingPoints = (value) => {
  const rating = normalizeRating(value);
  return rating === 0 ? -1 : rating;
};

export const ratingLabel = (value) => {
  const rating = normalizeRating(value);
  if (rating === 3) return 'Super mitgemacht';
  if (rating === 2) return 'Ordentlich mitgemacht';
  if (rating === 1) return 'Etwas mitgemacht';
  return 'Keine Sterne, −1 Punkt';
};

export const formatTrainingDate = (inputValue) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inputValue || '')) return '';
  const [year, month, day] = inputValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '';
  }
  const weekday = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][date.getDay()];
  return `${weekday}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
};

export const summarizePlayerTrainings = (trainings, playerName) => {
  let attendCount = 0;
  let excusedCount = 0;
  let unexcusedCount = 0;
  let ratingTotal = 0;
  let ratingCount = 0;
  let pointsTotal = 0;
  let consideredCount = 0;

  const details = trainings.flatMap((training) => {
    const belongsToTraining =
      Object.prototype.hasOwnProperty.call(training.participants || {}, playerName) ||
      Object.prototype.hasOwnProperty.call(training.ratings || {}, playerName);
    if (!belongsToTraining) return [];

    consideredCount += 1;
    const icon = training.participants?.[playerName] || '⏳';
    if (icon === '✅') attendCount += 1;
    else if (icon === '❌') excusedCount += 1;
    else unexcusedCount += 1;

    const hasRating = Object.prototype.hasOwnProperty.call(
      training.ratings || {},
      playerName
    );
    const rating = hasRating ? normalizeRating(training.ratings[playerName]) : null;
    const points = hasRating ? ratingPoints(rating) : null;
    if (hasRating) {
      ratingTotal += rating;
      ratingCount += 1;
      pointsTotal += points;
    }

    return [{
      date: training.date,
      statusText: iconToText(icon),
      rating,
      points,
    }];
  });

  return {
    consideredCount,
    attendCount,
    excusedCount,
    unexcusedCount,
    averageRating:
      ratingCount > 0 ? (ratingTotal / ratingCount).toFixed(1).replace('.', ',') : '–',
    ratingCount,
    pointsTotal,
    details,
  };
};
