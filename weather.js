// weather display server - displays current local weather information
// Setup all required packages
// Although the next line refers to jslint, it is altering jshint behavior 
/*jslint node: true */
'use strict';
var express = require("express");
var bodyParser = require("body-parser");
var fs = require("fs");
var jsdom = require("jsdom");
var readLine = require("readline");
var WebSocketServer = require("ws").Server;
var WebSocket = require("ws");
var spawn = require("child_process").spawn;
var execSync = require("child_process").execSync;
var exec = require("child_process").exec;
var listOfAccounts = "";
var balances = [];
var databaseName = "everyday";
var databaseStatus = true;
// Read main html page - this will be parsed later
let mainPageContents = fs.readFileSync("./index.html");
var app = express();
var statTime = [];
var relay = [];
var marketChanged = false;

var https = require("https");


// initialize global information

var ONE_DAY = 3600000 * 24;

var debug = false;

var firstTime = true;

process.env.TZ = 'US/Central';
// check for changes 
setInterval(function(){
    let changed = false;
    for (let entry of statTime) {
      changed |= fs.statSync(entry.Path).ctime.valueOf() != entry.Time.valueOf();
      entry.Time = fs.statSync(entry.Path).ctime;
    }
    if (changed) {
      // do stuff commanded from external event
      console.log("need to do something");
    }
    let delta = (new Date()) - fs.statSync("weatherUpdated").mtime.valueOf();
    if (firstTime) {
	// do first time things
	firstTime = false;
    }
  },1000);
// if the express server is contacted, look at the request and build a response or
// forward the request to the standard server behavior.
app.get("/", function(request, response, next) {
    // this is the main page so build replacement DOM
    // that has the sections available to edit
    let files = fs.readdirSync("./");
    let dom = new jsdom.JSDOM(mainPageContents);
    let document = dom.window.document;
    let query = https.request({ protocol: "https:", hostname: "api.weather.gov", path: "/stations/KTKI/observations/latest", port: 443, method: "GET", headers: {'User-Agent' : "localWeatherServer", "Accept" : "application/geo+json"}}, function (result) {
	let bodySegments = [];
	result.on("data", function (data) {
	    console.log("Got some data from api");
	    bodySegments.push(data);
	});

	result.on("end", function () {
	    let body = Buffer.concat(bodySegments);
            let replyDOM = new jsdom.JSDOM(body);
	    //console.log("Response from query:"+replyDOM.serialize());
	    let replyDocument = replyDOM.window.document;
	    //console.log("Document portion:", replyDocument.body.textContent);
	    let replyJSON = JSON.parse(replyDocument.body.textContent); // make JSON object
	    //console.log(replyJSON);
	    let temperature = Number((32.0 + 9.0/5.0 * parseFloat(replyJSON.properties.temperature.value)).toFixed(0));
	    let windSpeed = Number((2.237 * parseFloat(replyJSON.properties.windSpeed.value)).toFixed(1));
	    if (isNaN(windSpeed)) {
		windSpeed = "at an unavailable speed";
		console.log("wind speed: ", replyJSON.properties.windSpeed.value);
	    } else {
		windSpeed = " at " + windSpeed + " mph";
	    }
	    let direction = parseInt(replyJSON.properties.windDirection.value);
	    if (isNaN(direction)) {
		direction = "Wind direction not provided";
		console.log("wind direction: ", replyJSON.properties.windDirection.value);
		console.log("wind speed: ", replyJSON.properties.windSpeed.value);
	    } else {
		direction = "Wind from " + direction + "\xb0";
	    }
	    //console.log("Temperature:", temperature, "degrees F");
	    let asciiTemperature = temperature + "\xB0F";
	    //console.log("Sky:", replyJSON.properties.textDescription);
	    let elements = dom.window.document.querySelectorAll("p");
	    for (let element of elements) {
		//console.log("element: ", element, element.getAttribute('name'));
		if (element.getAttribute('name') == 'temperature') {
		    element.innerHTML = asciiTemperature;
		} else if (element.getAttribute('name') == 'description') {
		    element.innerHTML = replyJSON.properties.textDescription;
		} else if (element.getAttribute('name') == 'wind') {
		    element.innerHTML = direction + windSpeed;
		} else if (element.getAttribute('name') == 'time') {
		    element.innerHTML = "Last report: " + new Date(replyJSON.properties.timestamp);
		}
		    
	    }
	    response.send(dom.serialize());
	});
	result.on("error", function(){
	    console.log("query error on result path");
	});

    });
    query.on("error", function(error) {
	console.log("query error: " + error);
    });
    query.end();
    //response.send(dom.serialize());
});
// post processing section
// default processing section
app.get("*", function(request, response, next) {
    console.log("fell into default get");
    console.log(request.url);
    console.log(request.method);
    next();
  });
app.post("*", function(request, response, next) {
    console.log("fell into default post");
    console.log(request.url);
    console.log(request.method);
    next();
  });
app.use(express.static("./"));
var ws = new WebSocketServer({server: app.listen(process.env.PORT || 3000)});
/* The following section is only needed if the client connection uses a web socket
ws.on("connection", function(connection) {
    relay.push(connection); // store for communication
    console.log("web socket connection made at server from HTML client page");
    connection.send("connected");
    connection.on("message", function (message) {
        if (message === "exit") {
          relay.splice(relay.indexOf(connection), 1);
          connection.close();
        }
      });
    connection.on("close", function(message) {
        relay.splice(relay.indexOf(connection), 1);
        connection.close();
        console.log("closing a connection");
      });
    connection.on("error", function(message) {
        relay.splice(relay.indexOf(connection), 1);
        connection.close();
        console.log("error on ws connection:"+message);
      });
});
*/
console.log("weather server is listening");
