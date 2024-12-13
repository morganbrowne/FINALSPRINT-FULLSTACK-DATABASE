// Establish a WebSocket connection to the server
const socket = new WebSocket('ws://localhost:3000/ws');

// Listen for messages from the server
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);

  //TODO: Handle the events from the socket
});

/**
 * Handles adding a new poll to the page when one is received from the server
 *
 * @param {*} data The data from the server (ideally containing the new poll's ID and it's corresponding questions)
 */
function onNewPollAdded(data) {
  //TODO: Fix this to add the new poll to the page

  const pollContainer = document.getElementById('polls');
  const newPoll = document.createElement('div');
  newPoll.classList.add('poll');

  // pollContainer.appendChild(newPoll);
  //Question Element...
  const questionElement = document.createElement('h3');
  questionElement.textContent = data.question;
  newPoll.appendChild(questionElement);

  // Poll Options...
  const pollForm = document.createElement('form');
  pollForm.classList.add('poll-form');
  pollForm.setAttribute('data-poll-id', data.pollId);

  data.options.forEach((option, index) => {
    const optionElement = document.createElement('label');
    const inputElement = document.createElement('input');
    inputElement.type = 'radio';
    inputElement.name = 'option';
    inputElement.value = index; // Use index as the value for simplicity
    optionElement.appendChild(inputElement);
    optionElement.appendChild(document.createTextNode(option.text));
    pollForm.appendChild(optionElement);
  });

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Vote';
  pollForm.appendChild(submitButton);

  newPoll.appendChild(pollForm);
  pollContainer.appendChild(newPoll);

  // Add event listener to the form (in case the page changes dynamically)
  pollForm.addEventListener('submit', onVoteClicked);
}

/**
 * Handles updating the number of votes an option has when a new vote is recieved from the server
 *
 * @param {*} data The data from the server (probably containing which poll was updated and the new vote values for that poll)
 */
function onIncomingVote(data) {
  const poll = document.querySelector(`.poll[data-poll-id="${data.pollId}"]`);
  if (!poll) return; // If no poll found, exit

  const options = poll.querySelectorAll('label');
  data.options.forEach((option, index) => {
    const optionLabel = options[index];
    optionLabel.querySelector(
      'span'
    ).textContent = `${option.text} - ${option.votes} votes`;
  });
}

/**
 * Handles processing a user's vote when they click on an option to vote
 *
 * @param {FormDataEvent} event The form event sent after the user clicks a poll option to "submit" the form
 */

function onVoteClicked(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const pollId = formData.get("poll-id");
    const selectedOption = formData.get("option");
    
    // Send vote data to the server via WebSocket
    const voteData = {
        pollId: pollId,
        selectedOption: selectedOption
    };

    socket.send(JSON.stringify(voteData));
}



socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    // Handle the events from the socket
    if (data.type === 'newPoll') {
        onNewPollAdded(data);
    } else if (data.type === 'voteUpdate') {
        onIncomingVote(data);
    }
});

//Adds a listener to each existing poll to handle things when the user attempts to vote
document.querySelectorAll('.poll-form').forEach(pollForm => {
  pollForm.addEventListener('submit', onVoteClicked);
});
