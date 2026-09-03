import test from 'node:test';
import assert from 'node:assert/strict';

import {
  currentSeason,
  formatTrainingDate,
  normalizeRating,
  ratingLabel,
  ratingPoints,
  seasonDateRange,
  seasonForInputDate,
  seasonForTrainingDate,
  summarizePlayerTrainings,
} from './trainingUtils.js';

test('formatiert ein gültiges Trainingsdatum mit deutschem Wochentag', () => {
  assert.equal(formatTrainingDate('2026-09-03'), 'Do, 03.09.2026');
});

test('weist ungültige Datumswerte zurück', () => {
  assert.equal(formatTrainingDate('2026-02-31'), '');
  assert.equal(formatTrainingDate('03.09.2026'), '');
  assert.equal(formatTrainingDate(''), '');
});

test('ordnet Trainings korrekt einer Saison von Juli bis Juni zu', () => {
  assert.equal(seasonForInputDate('2025-07-01'), '2025/26');
  assert.equal(seasonForInputDate('2026-06-30'), '2025/26');
  assert.equal(seasonForInputDate('2026-07-01'), '2026/27');
  assert.equal(seasonForTrainingDate('Do, 03.09.2026'), '2026/27');
  assert.equal(currentSeason(new Date(2026, 8, 3)), '2026/27');
  assert.deepEqual(seasonDateRange('2025/26'), {
    from: '2025-07-01',
    to: '2026-06-30',
  });
});

test('begrenzt Bewertungen auf null bis drei Sterne', () => {
  assert.equal(normalizeRating(-2), 0);
  assert.equal(normalizeRating(2.6), 3);
  assert.equal(normalizeRating(9), 3);
  assert.equal(normalizeRating('ungültig'), 0);
});

test('wertet null Sterne als minus einen Punkt', () => {
  assert.equal(ratingPoints(0), -1);
  assert.equal(ratingPoints(1), 1);
  assert.equal(ratingPoints(2), 2);
  assert.equal(ratingPoints(3), 3);
  assert.equal(ratingLabel(0), 'Keine Sterne, −1 Punkt');
});

test('wertet Sterne ausschließlich bei Teilnahme', () => {
  const result = summarizePlayerTrainings(
    [
      {
        date: 'Mo, 31.08.2026',
        participants: { Mia: '✅' },
        ratings: { Mia: 3 },
      },
      {
        date: 'Di, 01.09.2026',
        participants: { Mia: '❌' },
        ratings: { Mia: 0 },
      },
      {
        date: 'Do, 03.09.2026',
        participants: { Mia: '⏳' },
        ratings: { Mia: 2 },
      },
    ],
    'Mia'
  );

  assert.equal(result.attendCount, 1);
  assert.equal(result.excusedCount, 1);
  assert.equal(result.unexcusedCount, 1);
  assert.equal(result.consideredCount, 3);
  assert.equal(result.averageRating, '3,0');
  assert.equal(result.averageRatingValue, 3);
  assert.equal(result.ratingCount, 1);
  assert.equal(result.pointsTotal, 3);
  assert.deepEqual(
    result.details.map(({ statusText, rating, points }) => ({ statusText, rating, points })),
    [
      { statusText: 'Teilgenommen', rating: 3, points: 3 },
      { statusText: 'Abgemeldet', rating: null, points: null },
      { statusText: 'Nicht abgemeldet', rating: null, points: null },
    ]
  );
});

test('bestraft fehlende Bewertungen aus dem Altbestand nicht rückwirkend', () => {
  const result = summarizePlayerTrainings(
    [
      { date: 'Mo, 31.08.2026', participants: { Mia: '✅' } },
      { date: 'Di, 01.09.2026', participants: { Mia: '✅' }, ratings: { Mia: 0 } },
    ],
    'Mia'
  );

  assert.equal(result.ratingCount, 1);
  assert.equal(result.averageRating, '0,0');
  assert.equal(result.pointsTotal, -1);
  assert.equal(result.details[0].rating, null);
  assert.equal(result.details[0].points, null);
});

test('zählt Trainings vor der Aufnahme einer Spielerin nicht als versäumt', () => {
  const result = summarizePlayerTrainings(
    [
      { date: 'Mo, 31.08.2026', participants: { Lea: '✅' }, ratings: { Lea: 3 } },
      { date: 'Do, 03.09.2026', participants: { Mia: '⏳' }, ratings: { Mia: 0 } },
    ],
    'Mia'
  );

  assert.equal(result.consideredCount, 1);
  assert.equal(result.unexcusedCount, 1);
  assert.equal(result.details.length, 1);
  assert.equal(result.details[0].date, 'Do, 03.09.2026');
});

test('schließt trainingsbezogene Inaktivität mit Begründung aus der Wertung aus', () => {
  const result = summarizePlayerTrainings(
    [
      {
        date: 'Di, 01.09.2026',
        participants: { Mia: '⏳' },
        ratings: { Mia: 0 },
        inactiveReasons: { Mia: 'Klassenfahrt' },
      },
      {
        date: 'Do, 03.09.2026',
        participants: { Mia: '✅' },
        ratings: { Mia: 3 },
      },
    ],
    'Mia'
  );

  assert.equal(result.inactiveCount, 1);
  assert.equal(result.consideredCount, 1);
  assert.equal(result.attendCount, 1);
  assert.equal(result.pointsTotal, 3);
  assert.equal(result.details[0].statusText, 'Inaktiv');
  assert.equal(result.details[0].inactiveReason, 'Klassenfahrt');
});
