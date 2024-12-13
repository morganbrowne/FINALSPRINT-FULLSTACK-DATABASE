const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
    pollId: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    selectedOption: { type: String, required: true },
    votedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Vote', voteSchema);
