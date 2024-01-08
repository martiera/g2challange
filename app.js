const express = require('express');
const bodyParser = require('body-parser');
const Datastore = require('nedb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Rest of the code remains the same

// Create a NeDB datastore
const db = new Datastore({ filename: 'users.db', autoload: true });

app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  // Retrieve users from NeDB or your database and sort by name
  db.find({}).sort({ name: 1 }).exec((err, users) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }

    // Add "pick up user" as the first element in the users array
    const pickUpUser = { name: '-- Izvēlies vārdu --' };
    users.unshift(pickUpUser);

    // Retrieve the error message from the query parameters
    const errorMessage = req.query.error || '';

    // Render the index.html template and pass the users data
    res.render('index', { users, errorMessage });
  });
});

//app.use(express.static('public'));


app.post('/submit', (req, res) => {
  const { name, weight } = req.body;

  // Find the user by name
  db.findOne({ name }, (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }

    const dayjs = require('dayjs');

    // Update the user or insert a new one
    if (user) {

      const today = dayjs().startOf('day');
      const lastSubmissionDate = user.lastSubmissionDate ? user.lastSubmissionDate : null;

      // Check if the user day is Monday
      if ( today.day() !== 1) {
        const errorMessage = "Datus atļauts iesniegt tikai pirmdienā.";
        return res.redirect('/?error=' + encodeURIComponent(errorMessage));
      }

      // Check if the user has already submitted a weight today
      if (lastSubmissionDate && today.isSame(dayjs(lastSubmissionDate), 'day')) {
        const errorMessage = "Tu jau esi iesniedzis datus par šo nedēļu.";
        return res.redirect('/?error=' + encodeURIComponent(errorMessage));
      }

      // User exists, update the weights
      const lastWeekWeight = user.weights.length > 0 ? user.weights[user.weights.length - 1] : null;

      if (lastWeekWeight !== null && Number(weight) >= lastWeekWeight) {
        // If the current weight is the same or larger than the last recorded weight, add penalty points
        user.penaltyPoints += 5;
      }

      db.update({ name }, { $set: { name, penaltyPoints: user.penaltyPoints, lastSubmissionDate: dayjs().format() }, $push: { weights: parseFloat(weight) } }, {}, (err) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Internal Server Error');
        }
        res.redirect('/leaderboard');
      });
    } else {
      // User doesn't exist, insert a new one
      db.insert({ name, weights: [Number(weight)], penaltyPoints: 0, lastSubmissionDate: dayjs().format() }, (err) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Internal Server Error');
        }
        res.redirect('/leaderboard');
      });
    }
  });
});

app.get('/leaderboard', (req, res) => {
  // Retrieve users from NeDB and sort by penalty points
  db.find({}).sort({ name: 1 }).exec((err, users) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }

    // Calculate additional information for each user
    let totalWeightLossCurrentWeek = 0;
    let totalDifference = 0;

    // Calculate additional information for each user
    users.forEach((user) => {
      const weights = user.weights;
      const initialWeight = weights.length > 0 ? weights[0] : null;
      const lastWeekWeight = weights.length > 1 ? weights[weights.length - 2] : null;
      const currentWeekWeight = weights.length > 0 ? weights[weights.length - 1] : null;

      user.initialWeight = initialWeight;
      user.lastWeekWeight = lastWeekWeight;
      user.currentWeekWeight = currentWeekWeight;
      user.differenceLastWeek = lastWeekWeight !== null ? (currentWeekWeight - lastWeekWeight).toFixed(1) : null;
      user.totalDifference = initialWeight !== null ? (currentWeekWeight - initialWeight).toFixed(1) : null;
      user.isNegativeDifference = user.differenceLastWeek !== null && user.differenceLastWeek < 0;

      // Update total weight loss for the current week
      totalWeightLossCurrentWeek += user.differenceLastWeek !== null ? parseFloat(user.differenceLastWeek) : 0;
      // Update total difference across all weeks
      totalDifference += user.totalDifference !== null ? parseFloat(user.totalDifference) : 0;
    });

    res.render('leaderboard', { users, totalWeightLossCurrentWeek, totalDifference });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

