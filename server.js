'use strict';

const express = require("express");
// const mongoose = require("mongoose");
// I don't use mongoose in this projects...
const MongoClient = require("mongodb").MongoClient;
const database = "cluster0-j4ymq";
let queryObj = {}; // using for database query
let countClose = 0; // counter for closing connection

// Function for database close:
const closeConnection = (db) => {
  countClose --;
  if (countClose === 0) {
    db.close();
    // console.log("Database connection closed.");
  }
};

// https://nodejs.org/api/url.html:
// https://www.w3schools.com/nodejs/nodejs_url.asp:
// The URL module splits up a web address into readable parts.
const url = require("url");

// https://nodejs.org/api/dns.html#dns_dns:
// https://www.w3schools.com/nodejs/ref_dns.asp:
const dns = require('dns');

const cors = require('cors');

const app = express();

// Basic Configuration 
const port = process.env.PORT || 3000;

app.use(cors());

/** this project needs to parse POST bodies **/
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({
  extended: false
}));

app.use(bodyParser.json());

app.use('/public', express.static(process.cwd() + '/public'));

app.get('/', function(req, res){
  res.sendFile(process.cwd() + '/views/index.html');
});

// get data form POST:
app.post("/api/shorturl/new", (request, response) => {
  // URL to be shortened sent by user
  const dataPost = request.body.url; 
  
  // Parse an address with the url.parse() method, and it will return a Url object with each part of the address as properties:
  const addressParts = url.parse(dataPost, true);
  const host = addressParts.host;
  let pathname = addressParts.pathname;
  // trim the pathname from the unnecessary "/":
  while (pathname.slice(-1) ===  "/" ) {
    pathname = pathname.slice(0, -1)
  };
  let search = addressParts.search;
  search ? "" : search = "";
  const longUrl = host + pathname + search;
  
  // to be sure that the submitted url points to a valid site :
  dns.lookup(host, (error, address, family) => {
    if (address) {
      // The hostname is valid: Declare variables:
      let insertObj = {};
      
      const sendUrl = (shortUrl) => {
        response.json({
          original_url: longUrl,
          short_url: shortUrl
        });
      };

      // Connect to the database:
      MongoClient.connect(process.env.MONGO_URI, (error, db) => {
        countClose ++;
        if (error) throw error;
        const dbo = db.db(database);
        // Look for document or create collection at the first start:
        let nextId = 1;
        dbo.collection("autoIncrementId").findOne({}, (error, result) => {
          if (error) throw error;
          if (result === null) {
            // This is the first query, let's create the database:
            // Create autoIncrementId:
            insertObj = {
              _id: 1,
              counter: 1
            };
            dbo.collection("autoIncrementId").insertOne(insertObj, (error, result) => {
              if (error) throw error;
              console.log("counter: 1 inserted to the autoIncrementId collection!");
            });
            // Create host:
            insertObj = {
              url: longUrl,
              _id: 1
            };
            dbo.collection("host").insertOne(insertObj, (error, result) => {
              if (error) throw error;
              console.log(longUrl, "inserted to the host collection!");
            });
            
            // Send back the short Url:
            sendUrl("1");
            
          } else {
            nextId = result.counter + 1; // initialize the next id for host collection
            // Already created the database,  must check if the Url exists:
            queryObj = {
              url: longUrl
            };
            dbo.collection("host").findOne(queryObj, (error, result) => {
              if (error) throw error;
              if (result) {
                // this URL already exists in the database: send back the short URL:
                sendUrl(result._id);
              } else {
                // New URL; 1) Strore in the database; 2) Increase the autoIncrementId-counter; 3) Send to client the short URL
                // 1) Store the new url in the database:
                insertObj = {
                  _id: nextId,
                  url: longUrl
                };
                dbo.collection("host").insertOne(insertObj, (error, result) => {
                  if (error) throw error;
                  console.log(longUrl, "inserted to the host collection!");
                });

                // 2) Increase the ID-counter:
                // toUpdate object defin which document need to update:
                const toUpdate = {
                  counter: nextId -1
                };

                // newValues object defining which data vill be change in the document:
                // $set is the atomic operator
                const newValues = {
                  $set: {
                    counter: nextId
                  }
                };
                dbo.collection("autoIncrementId").updateOne(toUpdate, newValues, (error, result) => {
                  if (error) throw error;
                  console.log("AutoIncrementId-counter updated to ", nextId);
                });

                // 3) Send to client the short URL:
                sendUrl(nextId);
                closeConnection(db);
              }
            });
          }
        });
      });
    } else {
      // Invalid hostname: 
      response.json({
        error: "invalid Hostname"
      });
    }
  });
});

// Redirect the user to the stored Url:
app.get("/api/shorturl/:short", (request, response) => {
   // get the short url: 
  const shortUrl = + request.params.short;
  
  // ask the long Url from database:
  // Connect to the database using MONGO_URI key
  MongoClient.connect(process.env.MONGO_URI, (error, db) => {
    countClose ++;
    if (error) throw error;
    const dbo = db.db("cluster0-j4ymq");
    queryObj = {
      _id: shortUrl
    };
    dbo.collection("host").findOne(queryObj, (error, result) => {
      if (error) throw error;
      if (result) {
        const longUrl = result.url;
        response.redirect(`http://${longUrl}`);
      } else {
        console.log("not found");
        response.json({
          error: "No short url found for given input"
        });
      }
      closeConnection(db);
    });
  });
});

app.listen(port, function () {
  console.log('Node.js listening ...');
});
