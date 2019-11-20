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
// Read main html page - this will be parsed later
let mainPageContents = fs.readFileSync("./index.html");
const memwatch = require("memwatch-next");
memwatch.on('leak', function (info) {
    console.log("Memory leak detected:\n", info);
});
var app = express();
//var relay = []; // websocket connection info

var https = require("https");

var JSONObject = null;
var updateInProgress = false;

var updateJSONObject = function () {
    if (updateInProgress) {
	console.log("exiting update - update is in progress");
	return;
    }
    updateInProgress = true;
    console.log("Updating JSON object");
    let query = https.request({ protocol: "https:", hostname: "api.weather.gov", path: "/gridpoints/FWD/90,117/forecast/hourly", port: 443, method: "GET", headers: {'User-Agent' : "mbroihier@yahoo.com", "Accept" : "application/geo+json"}}, function (result) {
	let bodySegments = [];
	result.on("data", function (data) {
	    //console.log("Got some data from api");
	    bodySegments.push(data);
	});

	result.on("end", function () {
	    let body = Buffer.concat(bodySegments);
            let replyDOM = new jsdom.JSDOM(body);
	    //console.log("Response from query:"+replyDOM.serialize());
	    let replyDocument = replyDOM.window.document;
	    //console.log("Document portion:", replyDocument.body.textContent);
	    let replyJSON = JSON.parse(replyDocument.body.textContent); // make JSON object
	    JSONObject = replyJSON;
            for (let forecastObject of JSONObject.properties.periods) {
	      let rowTS = new Date(forecastObject.startTime);
		forecastObject.innerHTML = dayArray[rowTS.getDay()] + ((rowTS.getHours() < 10) ? "0":"") + rowTS.getHours() + ":" + ((rowTS.getMinutes() < 10) ? "0" : "") + rowTS.getMinutes();
	    };
	    lastUpdateTime = new Date();
	    updateInProgress = false;
	    console.log("Successful update of JSON object");
	});
	result.on("error", function(){
	    console.log("query error on result path");
	    updateInProgress = false;
	    console.log("Update of JSON object failed");
	});

    });
    query.on("error", function(error) {
	console.log("query error: " + error);
	updateInProgress = false;
	console.log("Update of JSON object failed");
    });
    query.end();    
};

var lastUpdateTime = null;

// initialize global information

var ONE_INTERVAL = 600000;

var debug = false;

var firstTime = true;

var dayArray = ["Sun ", "Mon ", "Tue ", "Wed ", "Thu ", "Fri ", "Sat "];

var pattern = /[^:]+:\d\d/;

process.env.TZ = 'US/Central';
// check for changes 
setInterval(function(){
    let delta = new Date() - lastUpdateTime;
    if (delta > ONE_INTERVAL) {
	updateJSONObject();
    }
},1000);
// if the express server is contacted, look at the request and build a response or
// forward the request to the standard server behavior.
app.get("/", function(request, response, next) {
    console.log("processing /index.html");
    console.log(request.url);
    console.log(request.method);
    // this is the main page so build replacement DOM
    // that has the sections available to edit
    let dom = new jsdom.JSDOM(mainPageContents);
    let document = dom.window.document;
    //console.log(JSONObject);
    // fill in forecast table and estimate temperature at time of table generation
    let insertionPoint = dom.window.document.querySelector("#forecastTable");
    let count = 0;
    for (let forecastObject of JSONObject.properties.periods) {
	if ((count % 6) == 0) {
	    let tableRow = dom.window.document.createElement("tr");
	    let tableCellDate = dom.window.document.createElement("td");
	    tableCellDate.innerHTML = forecastObject.innerHTML;
	    tableRow.appendChild(tableCellDate);
	    let tableCellTemp = dom.window.document.createElement("td");
	    tableCellTemp.innerHTML = forecastObject.temperature;
	    tableCellTemp.setAttribute('style', 'text-align:center');
	    tableRow.appendChild(tableCellTemp);
	    let tableCellWind = dom.window.document.createElement("td");
	    tableCellWind.innerHTML = forecastObject.windSpeed;
	    tableRow.appendChild(tableCellWind);
	    let tableCellDesc = dom.window.document.createElement("td");
	    tableCellDesc.innerHTML = forecastObject.shortForecast;
	    tableRow.appendChild(tableCellDesc);
	    insertionPoint.appendChild(tableRow);
	}
	count = count + 1;
    }
    let temperature = JSONObject.properties.periods[0].temperature;
    let windSpeed = JSONObject.properties.periods[0].windSpeed;
    let direction = JSONObject.properties.periods[0].windDirection;
    let asciiTemperature = temperature + "\xB0F";
    let elements = dom.window.document.querySelectorAll("p");
    for (let element of elements) {
	if (element.getAttribute('name') == 'temperature') {
	    element.innerHTML = asciiTemperature;
	} else if (element.getAttribute('name') == 'description') {
	    element.innerHTML = JSONObject.properties.periods[0].shortForecast;
	} else if (element.getAttribute('name') == 'wind') {
	    element.innerHTML = direction + " @ " + windSpeed;
	} else if (element.getAttribute('name') == 'time') {
	    let dateString = new Date().toString();
	    element.innerHTML = pattern.exec(dateString)[0];
	}
    }
    response.send(dom.serialize());
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
