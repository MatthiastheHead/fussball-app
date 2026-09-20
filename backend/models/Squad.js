const mongoose = require('mongoose');
const { POSITIONS, validDate } = require('../squadUtils');
const Schema = mongoose.Schema;
const config = { fieldPlayers: { type: Number, default: 8, min: 2, max: 10 }, benchSize: { type: Number, default: 4, min: 0, max: 15 }, formation: { type: String, default: '3-3-2' } };
const profile = new Schema({
  playerId: { type: String, default: '' }, name: { type: String, required: true, maxlength: 100 }, guest: { type: Boolean, default: false },
  foot: { type: String, enum: ['unbekannt', 'links', 'rechts', 'beidfüßig'], default: 'unbekannt' },
  mainPosition: { type: String, enum: ['', ...POSITIONS], default: '' }, positions: [{ type: String, enum: POSITIONS }],
  number: { type: String, default: '', maxlength: 2 }, club: { type: String, default: '', maxlength: 100 }, note: { type: String, default: '', maxlength: 1000 }, inactive: { type: Boolean, default: false },
});
const game = new Schema({
  fussballGameId: { type: String, default: '' }, fussballTeamId: { type: String, default: '' }, opponentTeamUrl: { type: String, default: '', maxlength: 600 }, home: { type: Boolean, default: false },
  ...config, opponent: { type: String, required: true, maxlength: 100 }, location: { type: String, default: '', maxlength: 200 },
  date: { type: String, required: true, validate: validDate }, time: { type: String, required: true }, from: { type: String, required: true, validate: validDate }, to: { type: String, required: true, validate: validDate },
  captainId: { type: String, default: '' }, viceCaptainIds: { type: [String], default: [] },
  availableIds: { type: [String], default: undefined },
  lineup: [new Schema({ personId: { type: String, required: true }, name: { type: String, required: true }, guest: Boolean, role: { type: String, enum: ['field', 'keeper', 'bench'], required: true }, position: { type: String, enum: ['', ...POSITIONS] }, x: { type: Number, min: 5, max: 95 }, y: { type: Number, min: 5, max: 95 } }, { _id: false })],
  createdBy: String, createdAt: Date, updatedBy: String, updatedAt: Date,
});
const schema = new Schema({ key: { type: String, unique: true, default: 'squads', enum: ['squads'] }, fussballTeamUrl: { type: String, default: require('../fussballSource').DEFAULT_TEAM_URL }, ...config, captainId: { type: String, default: '' }, viceCaptainIds: { type: [String], default: [] }, profiles: [profile], games: [game] }, { optimisticConcurrency: true });
module.exports = mongoose.model('Squad', schema);
