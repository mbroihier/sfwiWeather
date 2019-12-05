// weather display server - displays current local weather information
// Setup all required packages
// Although the next line refers to jslint, it is altering jshint behavior
/*jslint esversion:6 */
/*jslint node:true, maxerr:50  */
'use strict';
process.env.TZ = 'US/Central';
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
var mainPageContents = fs.readFileSync("./index.html");
const memwatch = require("memwatch-next");
memwatch.on('leak', function (info) {
    console.log(new Date());
    console.log("Memory leak detected:\n", info);
});
var app = express();

var https = require("https");

var JSONObject = null;
var updateInProgress = false;
var radarUpdateInProgress = false;
var buildHTML = false;
var temperatureRange = {};
var dayArray = ["Sun ", "Mon ", "Tue ", "Wed ", "Thu ", "Fri ", "Sat "];
var radarImages = [];

for (let day of dayArray) {
    for (let hour=0; hour < 24; hour++) {
	temperatureRange[day + ((hour < 10)? "0":"") + hour + ":00"] = "";
    }
}

var updateJSONObject = function () {
    if (updateInProgress || radarUpdateInProgress) {
	console.log("exiting update - update is in progress");
	return;
    }
    updateInProgress = true;
    radarUpdateInProgress = true;
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
	    try {
		let replyJSON = JSON.parse(replyDocument.body.textContent); // make JSON object
		JSONObject = replyJSON;
	    } catch (err) {
		console.log("Error while parsing weather data reply:", err);
	    }
	    if (JSONObject != null && "properties" in JSONObject) {
		for (let forecastObject of JSONObject.properties.periods) {
		    let rowTS = new Date(forecastObject.startTime);
		    forecastObject.innerHTML = dayArray[rowTS.getDay()] + ((rowTS.getHours() < 10) ? "0":"") + rowTS.getHours() + ":" + ((rowTS.getMinutes() < 10) ? "0" : "") + rowTS.getMinutes();
		}
		lastUpdateTime = new Date();
		let currentDay = dayArray[(new Date()).getDay()];
		for (let index=0; index < JSONObject.properties.periods.length; index++ ) { // find min / max temperature for the day
		    if (JSONObject.properties.periods[index].innerHTML.includes(currentDay)) {
			//console.log("Skipping", currentDay);;
		    } else {
			let lowTemp = null;
			let highTemp = null;
			let foundIndexLow = 0;
			let foundIndexHigh = 0;
			//console.log("Processing", JSONObject.properties.periods[index].innerHTML);
			for (let trIndex=index; (trIndex < index+24) && (trIndex < JSONObject.properties.periods.length); trIndex++) {
			    //console.log("Periods index",trIndex);
			    let temperatureOfInterest = parseInt(JSONObject.properties.periods[trIndex].temperature);
			    if (lowTemp == null) {
				lowTemp = temperatureOfInterest;
			    } else if (lowTemp > temperatureOfInterest) {
				lowTemp = temperatureOfInterest;
				foundIndexLow = trIndex;
			    }
			    if (highTemp == null) {
				highTemp = temperatureOfInterest;
			    } else if (highTemp < temperatureOfInterest) {
				highTemp = temperatureOfInterest;
				foundIndexHigh = trIndex;
			    }
			}
			for (let trIndex=index; (trIndex < index+24) && (trIndex < JSONObject.properties.periods.length); trIndex++) {
			    if (foundIndexLow > foundIndexHigh) {
				temperatureRange[JSONObject.properties.periods[trIndex].innerHTML] = "" + highTemp + "\xB0/" + lowTemp + "\xB0";
			    } else {
				temperatureRange[JSONObject.properties.periods[trIndex].innerHTML] = "" + lowTemp + "\xB0/" + highTemp + "\xB0";
			    }
			}
			index = index + 23; // advance to next day
		    }
		}
		//console.log(temperatureRange);
		updateInProgress = false;
		if (radarUpdateInProgress == false) {
		    buildHTML = true;
		}
		console.log("Successful update of JSON object");
	    } else {
		updateInProgress = false;
		console.log("failed to update JSON object");
	    }
	});
	result.on("error", function(){
	    console.log("query error on result path");
	    updateInProgress = false;
	    if (radarUpdateInProgress == false) {
		buildHTML = true;
	    }
	    console.log("Update of JSON object failed");
	});

    });
    query.on("error", function(error) {
	console.log("query error: " + error);
	updateInProgress = false;
        if (radarUpdateInProgress == false) {
            buildHTML = true;
	}
	console.log("Update of JSON object failed");
    });
    query.end();
    let ftpClient = https.request({ protocol: "https:", hostname: "radar.weather.gov", path: "/RadarImg/NCR/FWS/", port: 443, method: "GET", headers: {'User-Agent' : "mbroihier@yahoo.com"}}, function (result) {
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
            let tds = replyDocument.querySelectorAll("td");
	    for (let td of tds) {
		let anchors = td.getElementsByTagName("a");
		if (anchors.length > 0) {
		    radarImages.push(anchors[0].innerHTML);
		    if (radarImages.length > 10) {
			radarImages.shift();
		    }
		}
	    }
	    radarUpdateInProgress = false;
	    if (updateInProgress == false) {
		buildHTML = true;
	    }
	    console.log("Successful update of radar images");
	    //console.log(radarImages);
	});
    });
    ftpClient.on("error", function(error) {
	radarUpdateInProgress = false;
	if (updateInProgress == false) {
	    buildHTML = true;
	}
	console.log("ftp query error", error);
    });
    ftpClient.end();
};

var mainPageDOM = null;
var next12Hours = {};
var lastRecordedHour = 0;
var historicalTemp = [];

var updateHTML = function () {
    console.log("Updating HTML");
    let dom = new jsdom.JSDOM(mainPageContents);
    //let document = dom.window.document;
    //console.log(JSONObject);
    // fill in forecast table and estimate temperature at time of table generation
    let insertionPoint = dom.window.document.querySelector("#forecastTable");
    let count = 0;
    let tempPlotData ='var reviver = function(name, value) { if (name === \'0\') { value = new Date(value); } return value;}; var collectedData = JSON.parse(\'{ "temperature" : ';
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
	if (count < 24) {
	    if (count == 0) {
		tempPlotData += "[[";
	    } else {
		tempPlotData += ",[";
	    }
            let startTime = (new Date(forecastObject.startTime)).getTime();
	    tempPlotData += startTime + ',';
	    tempPlotData += forecastObject.temperature + ']';
            if (count === 0) {
	        tempPlotData += ",[" +startTime + ','; // add an extra start point - plot weirdness
	        tempPlotData += forecastObject.temperature + ']';
                if (startTime != lastRecordedHour) {
                    if (lastRecordedHour === 0 ) { //first time
                        for (let lRHIndex = 5; lRHIndex >= 0; lRHIndex -= 1) {
                            historicalTemp.push([startTime - lRHIndex*3600000, forecastObject.temperature]);
                        }
                    } else {
                        historicalTemp.push([startTime, forecastObject.temperature]);
                    }
                    lastRecordedHour = startTime;
                }
                if (historicalTemp.length > 6) {
                    historicalTemp.shift();
                }
                console.log(historicalTemp);
            }
	}
	count += 1;
    }
    tempPlotData += "], \"oldTemperature\": ";
    count = 0;
    for (let oldSample of historicalTemp) {
        if (count == 0) {
	    tempPlotData += "[[";
	} else {
	    tempPlotData += ",[";
	}
        tempPlotData += oldSample[0] + "," + oldSample[1] + "]";
        count += 1;
    }
    tempPlotData += "]}',reviver);";
    console.log (tempPlotData);
    fs.writeFileSync("./plot_data.js", tempPlotData);
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
	} else if (element.getAttribute('name') == 'range') {
	    element.innerHTML = temperatureRange[dayArray[(new Date()).getDay()]+"00:00"];
	}
    }
    insertionPoint = dom.window.document.querySelector("#radar");
    count = 0;
    for (let image of radarImages) {
	let radarImage = dom.window.document.createElement("img");
	radarImage.setAttribute("id", "frame"+count);
	radarImage.setAttribute("class", "radarOverlay");
	radarImage.setAttribute("src", "https://radar.weather.gov/ridge/RadarImg/NCR/FWS/"+image);
	insertionPoint.appendChild(radarImage);
	count++;
    }
    //if (mainPageDOM) {
	//console.log("mainPageDOM exists");
	//console.log("Keys:", Object.keys(mainPageDOM.window));
	//console.log(typeof mainPageDOM.window);
	//for (let thing in mainPageDOM.window) {
	    //console.log("marking for reclaim of memory:", thing);
	    //delete mainPageDOM.window.thing;
	//};
    //};
    //console.log(typeof dom);
    //console.log(Object.keys(dom.window));
    //console.log("Keys:", Object.keys(dom.window));
    mainPageDOM = dom;
    buildHTML = false;
    console.log("HTML ready");
};

var lastUpdateTime = null;

// initialize global information

var ONE_INTERVAL = 600000;
//var ONE_INTERVAL = 60000;

var debug = false;

var firstTime = true;

var pattern = /[^:]+:\d\d/;

// check for changes 
setInterval(function(){
    let delta = new Date() - lastUpdateTime;
    if (delta > ONE_INTERVAL) {
	updateJSONObject();
    } else {
	if (buildHTML) {
	    updateHTML();
	}
    }
},1000);
// if the express server is contacted, look at the request and build a response or
// forward the request to the standard server behavior.
app.get("/", function(request, response, next) {
    console.log("processing /index.html");
    console.log(request.url);
    console.log(request.method);
    // this is the main page so return main page built in updateHTML
    response.send(mainPageDOM.serialize());
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
