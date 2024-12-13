const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
// Mongoose Conection... 
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');

const PORT = 3000;
//TODO: Update this URI to match your own MongoDB setup
const MONGO_URI = 'mongodb://localhost:27017/votingapp';
const app = express();
expressWs(app);


// // Vote Model...
// const voteSchema = new mongoose.Schema({
//     pollId: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll', required: true },
//     userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//     selectedOption: { type: String, required: true },
//     votedAt: { type: Date, default: Date.now }
// });

// module.exports = mongoose.model('Vote', voteSchema);

// Models Conection To App...
const User = require('./models/User');
const Poll = require('./models/Poll');

const Vote = require('./models/Vote');
const { errorMonitor } = require('events');



app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(session({
    secret: 'voting-app-secret',
    resave: false,
    saveUninitialized: false,
}));
let connectedClients = [];



 

// Websocket... 
app.ws('/ws', (socket, request) => {
    connectedClients.push(socket);

    socket.on('message', async (message) => {
        const data = JSON.parse(message);
        if (data.type === 'vote') {
            await onNewVote(data.pollId, data.selectedOption);
        }
        
    });

    socket.on('close', async (message) => {
        connectedClients = connectedClients.filter((client) => client !== socket);
    });
});


// Routes... 
app.get('/', async (request, response) => {
    if (request.session.user?.id) {
        return response.redirect('/dashboard');
    }
    response.render('index/unauthenticatedIndex', {});
});

app.get('/login', async (request, response) => {
    response.render('login', { errorMessage: null });
});

app.post('/login', async (request, response) => {
    const { email, password } = request.body;
    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
        request.session.user = {id: user_id, email: user.email};
        return response.redirect('/dashboard');
    }
    response.render('login', {errorMessage: 'Invalid email or password'});
});

app.get('/signup', async (request, response) => {

  
    if (request.session.user?.id) {
        return response.redirect('/dashboard');
    }

    return response.render('signup', { errorMessage: null });
});

app.post('/signup', async (request, response) => {

    const { email, password } = request.body;

    try {
        if (!email || !password) {
            return response.render('signup', {errorMessage: 'Email and password are required. '});
        }
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return response.render('signup', { errorMessage: "Email already in use "});
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ email, password: hashedPassword });
        await newUser.save();

        request.session.user = { id: newUser._id, email: newUser.email };
        return response.redirect('/dashboard');
} catch  (error) {
    console.error('Sign up Error:', error);
    return response.render('signup', { errorMessage: 'Error occured, please try again. '});
}


        
});
    

app.get('/dashboard', async (request, response) => {
    if (!request.session.user?.id) {
        return response.redirect('/');
    }

    const polls = await Poll.find();
    response.render('index/authenticatedIndex', { polls });

    //TODO: Fix the polls, this should contain all polls that are active. I'd recommend taking a look at the
    //authenticatedIndex template to see how it expects polls to be represented
    // return response.render('index/authenticatedIndex', { polls: [] });
});

app.get('/profile', async (request, response) => {
    
});

app.get('/createPoll', async (req, res) => {
    if (!req.session.user?.id) {
        return res.redirect('/');
    }
    res.render('createPoll');
});

app.get('/createPoll', async (request, response) => {
    const { question, options } = request.body;
    const formattedOptions = Object.values(options).map((option) => ({ answer: option, votes: 0}));

    const pollCreationError = await onCreateNewPoll(question, formattedOptions);
    if (pollCreationError) {
        return response.render('createPoll', { errorMessage: pollCreationError });
    }
    response.redirect('/dashboard');
    // if (!request.session.user?.id) {
    //     return response.redirect('/');
    // }

    // return response.render('createPoll')
});

// Poll creation
// app.post('/createPoll', async (request, response) => {
//     const { question, options } = request.body;
//     const formattedOptions = Object.values(options).map((option) => ({ answer: option, votes: 0 }));

//     const pollCreationError = onCreateNewPoll(question, formattedOptions);
//     //TODO: If an error occurs, what should we do?
// });

mongoose.connect(MONGO_URI)
    .then(() => app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)))
    .catch((err) => console.error('MongoDB connection error:', err));

/**
 * Handles creating a new poll, based on the data provided to the server
 * 
 * @param {string} question The question the poll is asking
 * @param {[answer: string, votes: number]} pollOptions The various answers the poll allows and how many votes each answer should start with
 * @returns {string?} An error message if an error occurs, or null if no error occurs.
 */
async function onCreateNewPoll(question, pollOptions) {
    try {
        //TODO: Save the new poll to MongoDB
    }
    catch (error) {
        console.error(error);
        return "Error creating the poll, please try again";
    }

    //TODO: Tell all connected sockets that a new poll was added

    return null;
}
async function onCreateNewPoll(question, pollOptions) {
    try {
        const newPoll = new Poll({ question, options: pollOptions });
        await newPoll.save();

        // Notify all connected clients about the new poll
        const pollData = {
            type: 'newPoll',
            id: newPoll._id,
            question: newPoll.question,
            options: newPoll.options,
        };

        connectedClients.forEach((client) => client.send(JSON.stringify(pollData)));
    } catch (error) {
        console.error(error);
        return 'Error creating the poll, please try again';
    }
    return null;
}
/**
 * Handles processing a new vote on a poll
 * 
 * This function isn't necessary and should be removed if it's not used, but it's left as a hint to try and help give
 * an idea of how you might want to handle incoming votes
 * 
 * @param {string} pollId The ID of the poll that was voted on
 * @param {string} selectedOption Which option the user voted for
 */

// Process a new vote... 
async function onNewVote(pollId, selectedOption) {
    try {
        const poll = await Poll.findById(pollId); // How to find the poll by id
        if (!poll) throw new Error('Poll not found');

        const option = poll.options.find((opt) => opt.answer === selectedOption);
        if (!option) throw new Error('Invalid option');

        option.votes += 1;
        await poll.save(); // saving the new poll.

        // Updated poll... 
        const updatedPoll = {
            type: 'newVote', 
            id: poll._id,
            options: poll.options,
        };
        connectedClients.forEach((client) => client.send(JSON.stringify(updatedPoll)));
    }
    catch (error) {
        console.error('Error updating poll:', error);
    }
}


// Voting submission end point. 
app.post('/vote', async (request, response) => {
    const { pollId, selectedOption } = request.body;
    const userId = request.session.user?.id;

    if (!userId) {
        return response.status(401).send('Unauthorized');
    }

    try {
        const vote = await Vote.create({
            pollId,
            userId,
            selectedOption,
        });
        response.status(201).send({ success: true, vote });
    } catch (error) {
        console.error('Error saving vote:', error);
        response.status(500).send({ success: false, message: 'Error saving vote' });
    }
});

