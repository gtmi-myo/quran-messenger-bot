require("dotenv").config();
import request from "request";
const path = require("path");
const fs = require("fs");
const verses = loadVerses();
console.log("verses", verses);
const quran = loadQuranVerses();
console.log("quran", quran);
const myan1 = loadTranslationVerses();
console.log("myan1", myan1);
const startLine = loadStartIndex();
console.log("startLine", startLine);

let postWebhook = (req, res) => {
  // Parse the request body from the POST
  let body = req.body;

  // Check the webhook event is from a Page subscription
  if (body.object === "page") {
    // Iterate over each entry - there may be multiple if batched
    body.entry.forEach(function (entry) {
      // Gets the body of the webhook event
      let webhook_event = entry.messaging[0];
      console.log(webhook_event);

      // Get the sender PSID
      let sender_psid = webhook_event.sender.id;
      console.log("Sender PSID: " + sender_psid);

      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhook_event.message) {
        handleMessage(sender_psid, webhook_event.message);
      } else if (webhook_event.postback) {
        handlePostback(sender_psid, webhook_event.postback);
      }
    });

    // Return a '200 OK' response to all events
    res.status(200).send("EVENT_RECEIVED");
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
};

let getWebhook = (req, res) => {
  // Your verify token. Should be a random string.
  let VERIFY_TOKEN = process.env.MY_VERIFY_FB_TOKEN;

  // Parse the query params
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
    // Checks the mode and token sent is correct
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      // Responds with the challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
};

// Handles messages events
function handleMessage(sender_psid, received_message) {
  let response = "";

  if (received_message.text) {
    const indexes = checkAndGetIndex(received_message.text);
    if (indexes[0] === "error") {
      response = `Sorry you've enter wrong keyword.
        The correct format for ask translation is surah number:ayah number.
        For example. 1:1`;
    }
    const validateSurahAndIndexResult = validateSurahAndIndex(
      indexes[0],
      indexes[1]
    );
    if (validateSurahAndIndexResult === "success") {
      const quranVerse = quran[startLine[indexes[0] - 1] + indexes[1] - 1];
      const myan1Verse = myan1[startLine[indexes[0] - 1] + indexes[1] - 1];
      response = `Surah ${indexes[0]} Ayah ${indexes[1]}
        Quran -
        "${quranVerse}"

        TranslationInBurmese -
        "${myan1Verse}"`;
    } else {
      response = validateSurahAndIndexResult;
    }
  } else if (received_message.attachments) {
    let attachment_url = received_message.attachments[0].payload.url;
    response = {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [
            {
              title: "Is this the right picture?",
              subtitle: "Tap a button to answer.",
              image_url: attachment_url,
              buttons: [
                {
                  type: "postback",
                  title: "Yes!",
                  payload: "yes",
                },
                {
                  type: "postback",
                  title: "No!",
                  payload: "no",
                },
              ],
            },
          ],
        },
      },
    };
  }

  // Sends the response message
  callSendAPI(sender_psid, response);
}

// Handles messaging_postbacks events
function handlePostback(sender_psid, received_postback) {
  let response;

  // Get the payload for the postback
  let payload = received_postback.payload;

  // Set the response based on the postback payload
  if (payload === "yes") {
    response = { text: "Thanks!" };
  } else if (payload === "no") {
    response = { text: "Oops, try sending another image." };
  }
  // Send the message to acknowledge the postback
  callSendAPI(sender_psid, response);
}

// Sends response messages via the Send API
function callSendAPI(sender_psid, response) {
  // Construct the message body
  console.log("respnse", response);
  let request_body = {
    recipient: {
      id: sender_psid,
    },
    message: { text: response },
  };

  // Send the HTTP request to the Messenger Platform
  request(
    {
      uri: "https://graph.facebook.com/v7.0/me/messages",
      qs: { access_token: process.env.FB_PAGE_TOKEN },
      method: "POST",
      json: request_body,
    },
    (err, res, body) => {
      if (!err) {
        console.log("message sent!");
      } else {
        console.error("Unable to send message:" + err);
      }
    }
  );
}

function checkAndGetIndex(request_text) {
  const separators = [":", ";", "/"];
  let result = ["error", null];

  for (let separator of separators) {
    const parts = request_text.split(separator);
    if (parts.length === 2) {
      const part1Int = parseInt(parts[0]);
      const part2Int = parseInt(parts[1]);
      if (!isNaN(part1Int) && !isNaN(part2Int)) {
        result = [part1Int, part2Int];
      } else {
        result = ["error", null];
      }
      break;
    }
  }
  return result;
}

function loadVerses() {
  const filePath = path.join(__dirname, "..", "data", "total.txt");
  let total = [];
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const lines = data.split(/\r?\n/);
    for (let line of lines) {
      total.push(parseInt(line));
    }
  } catch (err) {
    console.error(err);
  }
  return total;
}

function validateSurahAndIndex(suranNo, verseNo) {
  if (suranNo < 1 || suranNo > 114)
    return "There is only 114 surahs in Holy Quran So enter a Number between 1 to 114";
  const totalVerses = verses[suranNo - 1];
  if (verseNo < 1 || verseNo > totalVerses)
    return `There is only ${totalVerses} verses in Surah ${suranNo} So enter a Number between 1 to ${totalVerses}`;
  else return "success";
}

function loadQuranVerses() {
  const filePath = path.join(__dirname, "..", "data", "quran.txt");
  let quran = [];
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const lines = data.split(/\r?\n/);
    for (let line of lines) {
      quran.push(line);
    }
  } catch (err) {
    console.error(err);
  }
  return quran;
}

function loadTranslationVerses() {
  const filePath = path.join(__dirname, "..", "data", "myan1.txt");
  let myan1 = [];
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const lines = data.split(/\r?\n/);
    for (let line of lines) {
      myan1.push(line);
    }
  } catch (err) {
    console.error(err);
  }
  return myan1;
}

function loadStartIndex() {
  const filePath = path.join(__dirname, "..", "data", "startline.txt");
  let start = [];
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const lines = data.split(/\r?\n/);
    for (let line of lines) {
      start.push(parseInt(line));
    }
  } catch (err) {
    console.error(err);
  }
  return start;
}

module.exports = {
  postWebhook: postWebhook,
  getWebhook: getWebhook,
};
