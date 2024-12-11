const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    pollsVotedIn: { type: [mongoose.Schema.Types.ObjectId], ref: 'Poll' }
});

//  Hash the passwords with bcrypt... 
userSchema.pre('save', async function (next){
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

module.exports = mongoose.model('User', userSchema);