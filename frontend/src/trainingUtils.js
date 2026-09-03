export const STATUS_OPTIONS = [
  { icon: '✅', label: 'Teilgenommen' },
  { icon: '❌', label: 'Abgemeldet' },
  { icon: '⏳', label: 'Nicht abgemeldet' },
];

export const RATING_VALUES = [1, 2, 3];
export const TRAINING_LOCATIONS = ['Sportplatz', 'Turnhalle'];

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

const seasonFromParts = (year, month) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return '';
  }
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
};

export const seasonForInputDate = (inputValue) => {
  if (!formatTrainingDate(inputValue)) return '';
  const [year, month] = inputValue.split('-').map(Number);
  return seasonFromParts(year, month);
};

export const seasonForTrainingDate = (storedDate) => {
  const match = String(storedDate || '').match(/(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return '';
  return seasonFromParts(Number(match[3]), Number(match[2]));
};

export const currentSeason = (date = new Date()) =>
  seasonFromParts(date.getFullYear(), date.getMonth() + 1);

export const seasonDateRange = (season) => {
  const match = String(season || '').match(/^(\d{4})\/(\d{2})$/);
  if (!match) return { from: '', to: '' };
  const startYear = Number(match[1]);
  const expectedEnd = String((startYear + 1) % 100).padStart(2, '0');
  if (match[2] !== expectedEnd) return { from: '', to: '' };
  return {
    from: `${startYear}-07-01`,
    to: `${startYear + 1}-06-30`,
  };
};

export const summarizePlayerTrainings = (trainings, playerName) => {
  let attendCount = 0;
  let excusedCount = 0;
  let unexcusedCount = 0;
  let ratingTotal = 0;
  let ratingCount = 0;
  let pointsTotal = 0;
  let consideredCount = 0;
  let inactiveCount = 0;

  const details = trainings.flatMap((training) => {
    const belongsToTraining =
      Object.prototype.hasOwnProperty.call(training.participants || {}, playerName) ||
      Object.prototype.hasOwnProperty.call(training.ratings || {}, playerName) ||
      Object.prototype.hasOwnProperty.call(training.inactiveReasons || {}, playerName);
    if (!belongsToTraining) return [];

    const inactiveReason =
      typeof training.inactiveReasons?.[playerName] === 'string'
        ? training.inactiveReasons[playerName].trim()
        : '';
    if (inactiveReason) {
      inactiveCount += 1;
      return [{
        date: training.date,
        statusText: 'Inaktiv',
        inactiveReason,
        rating: null,
        points: null,
      }];
    }

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
      inactiveReason: '',
      rating,
      points,
    }];
  });

  const averageRatingValue = ratingCount > 0 ? ratingTotal / ratingCount : null;

  return {
    consideredCount,
    inactiveCount,
    attendCount,
    excusedCount,
    unexcusedCount,
    averageRating:
      averageRatingValue === null ? '–' : averageRatingValue.toFixed(1).replace('.', ','),
    averageRatingValue,
    ratingCount,
    pointsTotal,
    details,
  };
};
