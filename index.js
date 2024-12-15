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
app.use(
  session({
    secret: 'voting-app-secret',
    resave: false,
    saveUninitialized: false,
  })
);
let connectedClients = [];

// Websocket...
app.ws('/ws', (socket, request) => {
  connectedClients.push(socket);

  socket.on('message', async message => {
    const data = JSON.parse(message);
    if (data.type === 'vote') {
      await onNewVote(data.pollId, data.selectedOption);
    }
  });

  socket.on('close', async message => {
    connectedClients = connectedClients.filter(client => client !== socket);
  });
});

// Routes...
app.get('/', async (request, response) => {
  if (request.session.user?.id) {
    return response.redirect('/dashboard');
  }
  response.render('index/unauthenticatedIndex', { user: request.session.user });
});

app.get('/login', async (request, response) => {
//   if (request.session.user?.id) {
//     return response.redirect('/dashboard');
//   }
  response.render('login', { errorMessage: null, user: null });
});

app.post('/login', async (request, response) => {
  const { username, password } = request.body;
  const user = await User.findOne({ username });

  if (user && (await bcrypt.compare(password, user.password))) {
    request.session.user = { id: user._id, username: user.username };
    return response.redirect('/dashboard');
  }
  response.render('login', { errorMessage: 'Invalid username or password' });
});

app.get('/signup', async (request, response) => {
  if (request.session.user?.id) {
    return response.redirect('/dashboard');
  }

  return response.render('signup', { errorMessage: null, user: request.session.user });
});

app.post('/signup', async (request, response) => {
  const { username, password } = request.body;

  try {
    if (!username || !password) {
      return response.render('signup', {
        errorMessage: 'Username and password are required. ',
      });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return response.render('signup', {
        errorMessage: 'username already in use ',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    request.session.user = { id: newUser._id, username: newUser.username };
    return response.redirect('/dashboard');
  } catch (error) {
    console.error('Sign up Error:', error);
    return response.render('signup', {
      errorMessage: 'Error occured, please try again. ',
    });
  }
});

app.post('/vote', async (request, response) => {
  const { 'poll-id': pollId, 'poll-option': selectedOption } = request.body;

  try {
    const poll = await Poll.findById(pollId);
    if (!poll) {
      return response.status(404).send('Poll not found');
    }

    // Update the vote count for the selected option
    const option = poll.options.find(opt => opt.answer === selectedOption);
    if (option) {
      option.votes++;
      await poll.save();

      // Notify connected clients (real-time update)
      connectedClients.forEach(client => {
        client.send(
          JSON.stringify({
            type: 'vote',
            pollId,
            selectedOption,
            votes: option.votes,
          })
        );
      });
    }

    return response.redirect('/dashboard');
  } catch (error) {
    console.error('Error processing vote:', error);
    return response.status(500).send('Internal Server Error');
  }
});

app.get('/dashboard', async (request, response) => {
  if (!request.session.user?.id) {
    return response.redirect('/');
  }

  try {
    const polls = await Poll.find().lean();
    response.render('index/authenticatedIndex', {  user: request.session.user, polls });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    return response.render('error', {
      errorMessage: 'Failed to load dashboard.',
    });
  }

  //TODO: Fix the polls, this should contain all polls that are active. I'd recommend taking a look at the
  //authenticatedIndex template to see how it expects polls to be represented
  // return response.render('index/authenticatedIndex', { polls: [] });
});

app.get('/profile', async (request, response) => {});

app.get('/createPoll', async (req, res) => {
  if (!req.session.user?.id) {
    return res.redirect('/');
  }
  res.render('createPoll');
});

app.post('/createPoll', async (request, response) => {
  const { question, options } = request.body;

  if (!question || !options || !Object.keys(options).length) {
    return response.render('createPoll', {
      errorMessage: 'Questions and options are required',
    });
  }
  const formattedOptions = Object.values(options).map(option => ({
    answer: option,
    votes: 0,
  }));
  const newPoll = new Poll({
    question,
    options: formattedOptions,
    createdBy: request.session.user.id,
  });

  try {
    await newPoll.save();
    response.redirect('/dashboard');
  } catch (error) {
    console.error('Error creating poll', error);
    response.render('createPoll', {
      errorMessage: 'Failed to create poll. Please try again.',
    });
  }
  // const pollCreationError = await onCreateNewPoll(question, formattedOptions);
  // if (pollCreationError) {
  //     return response.render('createPoll', { errorMessage: pollCreationError });
  // }
  // response.redirect('/dashboard');
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
app.get('/your-route', (req, res) => {
    res.render('index/unauthenticatedIndex', { user: req.session.user });
});


mongoose
  .connect(MONGO_URI)
  .then(() =>
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    )
  )
  .catch(err => console.error('MongoDB connection error:', err));

/**
 * Handles creating a new poll, based on the data provided to the server
 *
 * @param {string} question The question the poll is asking
 * @param {[answer: string, votes: number]} pollOptions The various answers the poll allows and how many votes each answer should start with
 * @returns {string?} An error message if an error occurs, or null if no error occurs.
 */
// async function onCreateNewPoll(question, pollOptions) {
//   try {
//     //TODO: Save the new poll to MongoDB
//   } catch (error) {
//     console.error(error);
//     return 'Error creating the poll, please try again';
//   }

//   //TODO: Tell all connected sockets that a new poll was added

//   return null;
// }
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

    connectedClients.forEach(client => client.send(JSON.stringify(pollData)));
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

    const option = poll.options.find(opt => opt.answer === selectedOption);
    if (!option) throw new Error('Invalid option');

    option.votes += 1;
    await poll.save(); // saving the new poll.

    // Updated poll...
    const updatedPoll = {
      type: 'newVote',
      id: poll._id,
      options: poll.options,
    };
    connectedClients.forEach(client =>
      client.send(JSON.stringify(updatedPoll))
    );
  } catch (error) {
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

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error clearing session:', err);
            return res.redirect('/polls'); // Redirect to the homepage even if an error occurs
        }
        res.redirect('/'); // Redirect to the homepage after logging out
    });
});

app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Redirect to login if user is not logged in
    }
    res.render('profile', { user: req.session.user });
});

app.get('/polls', async (req, res) => {
    try {
        const polls = await Poll.find(); // Replace with your DB call to fetch polls
        res.render('polls', { user: req.session.user, polls });
    } catch (error) {
        console.error('Error fetching polls:', error);
        res.status(500).send('Internal Server Error');
    }
});
